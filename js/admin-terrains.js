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
   code = code court qui NOMME les mini-terrains posés dessus (« MUN » → MUN-1, MUN-2…). Il vient
   de la fiche du terrain : c'est lui qu'on lit sur le planning, à la table de marque et sur la
   page publique. ⛔ L'ancien champ `enBut` du grand terrain a disparu : l'en-but est désormais
   une donnée de CATÉGORIE (voir DIMENSIONS_CATEGORIE_DEFAUT et `gabaritCategorie`), parce que les
   cotes FFR d'une catégorie sont données SANS en-but. */
const TERRAINS_PHYSIQUES_DEFAUT = [
  { nom: 'Rugby 1', type: 'rugby', code: 'RUG1', L: 115, W: 70, pos: 'CG' },
  { nom: 'Rugby 2', type: 'rugby', code: 'RUG2', L: 110, W: 68, pos: 'BG' },
  { nom: 'Foot 1',  type: 'foot',  code: 'FOO1', L: 105, W: 68, pos: 'HC' },
  { nom: 'Foot 2',  type: 'foot',  code: 'FOO2', L: 100, W: 65, pos: 'CD' }
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

/* Taille de terrain par défaut selon la catégorie (m) : la SURFACE DE JEU, d'une ligne de but à
   l'autre — exactement comme la FFR la publie, donc SANS en-but.
   plein:true = un match occupe un GRAND terrain entier (cas U14).
   ⛔ Aucun en-but par défaut : il est propre au tournoi, l'organisateur le déclare. Rien de deviné. */
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
  // ⭐ Les positions libres enregistrées réamorcent la mémoire du module : sans cela, rouvrir
  //    l'écran replacerait tous les terrains sur l'ancienne grille.
  terrains.forEach(function (t) {
    if (t && t.code && Number.isFinite(parseFloat(t.x)) && Number.isFinite(parseFloat(t.y))) {
      positionsTerrains[t.code] = { x: parseFloat(t.x), y: parseFloat(t.y) };
    }
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

/** Profondeur d'en-but déclarée pour une catégorie (m, derrière CHAQUE ligne de but). 0 = aucune. */
function enButCategorie(d) {
  const v = parseFloat((d || {}).enBut);
  return v > 0 ? v : 0;
}

/**
 * GABARIT AU SOL d'un mini-terrain : ce qu'il occupe RÉELLEMENT sur le grand terrain.
 *
 * ⭐ POURQUOI CETTE FONCTION EXISTE. Les cotes d'une catégorie (U10 : 40 × 30) sont celles de la
 * SURFACE DE JEU, d'une ligne de but à l'autre — c'est ainsi que la FFR les publie. L'en-but
 * s'ajoute DERRIÈRE CHAQUE ligne de but : un U10 avec 5 m d'en-but occupe 50 × 30 au sol. Poser
 * les mini-terrains sur leurs cotes de jeu les collait donc les uns aux autres en-but compris.
 * ⛔ L'en-but s'ajoute sur l'axe de la LONGUEUR uniquement : c'est l'axe des poteaux.
 *
 * `l`/`w` = le gabarit au sol (ce que le packing manipule) ; `lJeu` et `eb` gardent la trace de
 * la surface de jeu et de l'en-but, pour pouvoir les dessiner séparément.
 * @return {{plein:true}|{l:number,w:number,lJeu:number,eb:number}}
 */
function gabaritCategorie(d) {
  if (!d) return null;
  if (d.plein) return { plein: true };
  const lJeu = parseFloat(d.l) || 0;
  const w = parseFloat(d.w) || 0;
  const eb = enButCategorie(d);
  if (!(lJeu > 0 && w > 0)) return { l: lJeu, w: w, lJeu: lJeu, eb: eb };
  return { l: lJeu + 2 * eb, w: w, lJeu: lJeu, eb: eb };
}

/**
 * Marque un mini-terrain avec l'en-but de sa catégorie et l'AXE sur lequel il s'ajoute.
 * Le packing pose la tuile dans un sens OU dans l'autre : on retrouve l'axe en comparant la
 * dimension posée au gabarit. Sans cette trace, le dessin ne saurait pas de quel côté hachurer.
 */
function marquerEnBut(tile, gab) {
  const eb = (gab && gab.eb > 0 && !gab.plein) ? gab.eb : 0;
  tile.eb = eb;
  tile.ebAxe = eb > 0 ? (Math.abs(tile.w - gab.l) < 0.01 ? 'x' : 'y') : '';
  return tile;
}

/** Injecte la carte « Terrains & répartition » dans #zone-terrains. */
function injecterTerrains() {
  const zone = document.getElementById('zone-terrains');
  if (!zone) return;
  const plan = planTerrainsActuel();
  const cats = categoriesPresentes();

  let h = '<h2>Terrains &amp; répartition</h2>';
  h += '<p class="note-generation">Déclare tes <strong>grands terrains</strong> réels et la ' +
       '<strong>taille de chaque catégorie</strong>. L\'appli calcule combien de mini-terrains ' +
       'y tiennent (couloirs de circulation compris).</p>';

  h += '<div class="cv-terrains"><section><h3 class="terr-titre">Grands terrains disponibles</h3>';
  h += '<div id="liste-terrains-physiques">';
  plan.terrains.forEach(function (t, i) { h += ligneTerrainPhysique(t, i); });
  h += '</div>';
  h += '<button type="button" class="bouton-lien" id="bouton-ajouter-terrain">+ Ajouter un grand terrain</button>';
  h += '<details class="cv-options"><summary>Options avancées<span>Circulation, table de marque, dimensions et capacités</span></summary>';
  h += '<p class="note-generation">📏 Les cotes d\'une catégorie sont celles de la <strong>surface ' +
       'de jeu</strong>, d\'une ligne de but à l\'autre — c\'est ainsi que la FFR les publie, ' +
       '<strong>sans l\'en-but</strong>. Indique la <strong>profondeur d\'en-but derrière chaque ' +
       'ligne de but</strong> : elle s\'ajoute de part et d\'autre, et c\'est ce ' +
       '<strong>gabarit au sol</strong> que l\'appli utilise pour poser les mini-terrains. ' +
       'Laisse <strong>vide</strong> si tu ne veux pas en réserver.</p>';

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

  h += '</details>';
  h += '<div class="ligne-action" style="margin-top:14px">' +
         '<button type="button" class="bouton" id="bouton-enregistrer-terrains">Enregistrer les terrains</button>' +
         '<span id="message-terrains" class="message-form"></span>' +
       '</div>';

  // Répartition automatique (étape 2)
  h += '</section><section class="cv-terrains-plan"><h3 class="terr-titre">Répartition automatique</h3>';
  h += '<p class="note-generation">Répartit les mini-terrains entre catégories <strong>selon le nombre ' +
       'd\'équipes</strong>, en gardant chaque catégorie groupée. La table de marque reste libre et ' +
       'se place directement sur la carte. Prévisualise, ajuste, puis applique.</p>';
  h += '<button type="button" class="bouton" id="bouton-repartir">' + svgIcone('terrain') + 'Répartir les terrains</button>';
  // ⭐ La zone d'annonce vit HORS de `#repartition-resultat`, qui est réécrit à chaque geste : un
  //   `aria-live` recréé en même temps que son texte n'est pas annoncé par les lecteurs d'écran.
  h += '<p id="repart-annonce" class="cv-annonce" role="status" aria-live="polite"></p>';
  h += '<div id="repartition-resultat"><div class="cv-terrain-vide"><strong>Aperçu de la répartition</strong><p>Calculez la répartition pour voir les mini-terrains sur le plan.<br>Vous pourrez l’ajuster avant de l’appliquer.</p></div></div></section></div>';

  zone.innerHTML = h;

  // Zone (re)construite depuis l'état ENREGISTRÉ → nouvelle référence pour le
  // détecteur de « modifications non enregistrées » de l'assistant.
  if (typeof assistantMarquerPropre === 'function') assistantMarquerPropre(zone);
}

/** La position enregistrée d'un terrain, en mètres, ou '' quand il n'en a pas encore. */
function positionSaisie(t, axe) {
  const memo = positionsTerrains[String(t.code || '')];
  const v = memo ? memo[axe] : t[axe];
  return Number.isFinite(parseFloat(v)) ? String(Math.round(parseFloat(v))) : '';
}

/** Une ligne « grand terrain » (nom, type, longueur × largeur, position, orientation, supprimer).
 *  @param {boolean} [ouvert] force le dépliant ouvert (fiche qu'on vient d'ajouter). */
function ligneTerrainPhysique(t, i, ouvert) {
  const opt=(v,lib,sel)=>'<option value="'+echapper(v)+'"'+(sel?' selected':'')+'>'+echapper(lib)+'</option>';
  const input=(cls,label,val,type)=>'<label>'+label+'<input class="'+cls+'" type="'+(type||'number')+'"'+(type==='text'?'':' min="0" step="1"')+' value="'+echapper(String(val==null?'':val))+'" aria-label="'+label+'"></label>';
  const code=String(t.code||codeTerrainAuto(t.nom,i));
  return '<details class="cv-terrain-detail" name="terrain-physique"'+((ouvert||i===0)?' open':'')+'><summary>'+echapper(t.nom||'Nouveau terrain')+'<small><span class="terr-code">'+echapper(code)+'</span>'+(t.type==='foot'?'Football':'Rugby')+' · '+echapper(String(t.L||'—'))+' × '+echapper(String(t.W||'—'))+' m</small></summary>' +
    '<div class="terrain-ligne" data-i="'+i+'">'+input('tp-nom','Nom du terrain',t.nom,'text') +
    '<label>Sport<select class="tp-type" aria-label="Type de terrain">'+opt('rugby','Rugby',t.type!=='foot')+opt('foot','Football',t.type==='foot')+'</select></label>' +
    '<label>Surface<select class="tp-nature" aria-label="Nature du terrain (surface de jeu)">'+opt('','À préciser',!t.nature)+NATURES_TERRAIN.map(n=>opt(n,n,n===t.nature)).join('')+'</select></label>' +
    input('tp-l','Longueur (m)',t.L)+input('tp-w','Largeur (m)',t.W) +
    '<label>Code court<input class="tp-code" type="text" maxlength="6" value="'+echapper(String(t.code||codeTerrainAuto(t.nom,i)))+'" aria-label="Code court du terrain" placeholder="'+echapper(codeTerrainAuto(t.nom,i))+'"><span class="terr-aide">nomme les mini-terrains : '+echapper(String(t.code||codeTerrainAuto(t.nom,i)))+'-1, '+echapper(String(t.code||codeTerrainAuto(t.nom,i)))+'-2…</span></label>' +
    '<label>Orientation (°)<input class="tp-rot" type="number" min="0" max="359" step="1" value="'+echapper(String(angleTerrain(t)))+'" aria-label="Orientation du terrain sur le plan, en degrés"><span class="terr-aide">0 = horizontal. Se règle aussi à la poignée ⟲ sur le plan.</span></label>' +
    // ⭐ POSITION SUR LE PLAN — une SAISIE, pas seulement un glisser (lot « Terrains »).
    //   ⛔ CE QUI N'ALLAIT PAS. La position ne vivait que dans `positionsTerrains`, une mémoire du
    //   module : le détecteur de « modifications non enregistrées » (assistant.js, qui ne regarde que
    //   les champs) ne la voyait pas. On déplaçait ses terrains, on changeait d'écran, et le travail
    //   partait sans un mot. Le plan n'était par ailleurs atteignable QU'À LA SOURIS.
    //   ⭐ La fiche est désormais la source enregistrée de la position, exactement comme de
    //   l'orientation juste au-dessus : le glisser écrit dans ces deux champs, et ils se règlent aussi
    //   au clavier. ⚠️ `hidden` ne convenait pas : l'assistant ignore les champs cachés.
    '<label>Position sur le plan — X (m)<input class="tp-x" type="number" step="1" value="'+echapper(positionSaisie(t,'x'))+'" aria-label="Position du terrain sur le plan, axe X, en mètres"></label>' +
    '<label>Position sur le plan — Y (m)<input class="tp-y" type="number" step="1" value="'+echapper(positionSaisie(t,'y'))+'" aria-label="Position du terrain sur le plan, axe Y, en mètres"><span class="terr-aide">Se règle aussi en glissant la plaque de nom sur le plan. Vide = placement automatique.</span></label>' +
    // ⛔ L'ancien emplacement de la grille 3×3 n'est plus une saisie, mais il est CONSERVÉ : il
    //    sert de repli pour placer un terrain qui n'a pas encore de position sur le plan.
    '<input type="hidden" class="tp-pos" value="'+echapper(String(t.pos||''))+'">' +
    '<button type="button" class="terr-suppr" aria-label="Supprimer ce terrain">Supprimer ce terrain</button></div></details>';
}

/** Une ligne « taille de catégorie » : surface de JEU, en-but, et le gabarit au sol qui en découle. */
function ligneDimensionCategorie(nom, d) {
  const plein = !!d.plein;
  const gab = gabaritCategorie(d);
  const auSol = (!plein && gab && gab.l > 0 && gab.w > 0)
    ? '<span class="dim-ausol" data-role="ausol-' + echapper(nom) + '">au sol : ' + gab.l + ' × ' + gab.w + ' m</span>'
    : '<span class="dim-ausol" data-role="ausol-' + echapper(nom) + '"></span>';
  return '<div class="dim-ligne" data-cat="' + echapper(nom) + '">' +
    '<span class="dim-nom">' + echapper(nom) + '</span>' +
    '<label class="mini-toggle"><input type="checkbox" class="dim-plein"' + (plein ? ' checked' : '') + '> terrain entier</label>' +
    '<span class="dim-taille"' + (plein ? ' hidden' : '') + '>' +
      '<input class="dim-l" type="number" min="0" step="1" value="' + echapper(String(plein ? '' : (d.l || ''))) + '" aria-label="Longueur de la surface de jeu (m)">' +
      '<span class="terr-x">×</span>' +
      '<input class="dim-w" type="number" min="0" step="1" value="' + echapper(String(plein ? '' : (d.w || ''))) + '" aria-label="Largeur (m)">' +
      '<span class="terr-unite">m</span>' +
      '<span class="terr-plus">+ en-but</span>' +
      '<input class="dim-enbut" type="number" min="0" step="1" value="' + echapper(String(plein ? '' : (enButCategorie(d) || ''))) + '" aria-label="Profondeur de l’en-but de ' + echapper(nom) + ' (m), derrière chaque ligne de but">' +
      '<span class="terr-unite">m</span>' +
    '</span>' + auSol +
    '</div>';
}

/** Tableau de capacité : une ligne par grand terrain, une colonne par catégorie. */
function tableauCapaciteHTML(terrains, dims, couloir, cats) {
  if (!cats || cats.length === 0) return '<p class="vide">Ajoute des catégories pour voir la capacité.</p>';
  let head = '<tr><th>Grand terrain</th>';
  cats.forEach(function (c) {
    const g = gabaritCategorie(dimensionCategorie(dims, c));
    const auSol = (g && !g.plein && g.l > 0 && g.w > 0) ? ' <span class="cap-dim">' + g.l + '×' + g.w + ' au sol</span>' : '';
    head += '<th>' + echapper(c) + auSol + '</th>';
  });
  head += '</tr>';
  let body = '';
  terrains.forEach(function (t) {
    body += '<tr><td class="cap-nom">' + echapper(String(t.nom || '?')) +
            ' <span class="cap-dim">' + (t.L || '?') + '×' + (t.W || '?') + '</span></td>';
    cats.forEach(function (c) {
      const d = dimensionCategorie(dims, c);
      const dimOk = d && (d.plein || (d.l > 0 && d.w > 0));
      // ⭐ Sur le GABARIT AU SOL (en-but compris) : sinon la capacité annoncée serait celle de
      //   mini-terrains collés les uns aux autres en-but compris — plus que ce qui tient.
      const cap = dimOk ? capaciteTerrain({ L: +t.L, W: +t.W }, gabaritCategorie(d), couloir) : '—';
      body += '<td>' + cap + (d && d.plein ? ' <span class="cap-plein">(entier)</span>' : '') + '</td>';
    });
    body += '</tr>';
  });
  return '<div class="tab-capacite-wrap"><table class="tab-capacite">' +
         '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}

/* --- Lecture des saisies en cours (depuis le formulaire affiché) --- */

/** Valeur numérique d'un champ, ou `undefined` s'il est vide. ⛔ Jamais 0 pour un champ vide :
 *  « pas de position » et « position 0 » ne sont pas la même chose sur un plan. */
function lireNombreOuVide(champ) {
  const brut = champ ? String(champ.value).trim() : '';
  if (brut === '') return undefined;
  const v = parseFloat(brut);
  return Number.isFinite(v) ? v : undefined;
}

function lireTerrainsDuFormulaire() {
  const out = [];
  document.querySelectorAll('#liste-terrains-physiques .terrain-ligne').forEach(function (row) {
    out.push({
      nom:  row.querySelector('.tp-nom').value.trim(),
      nature: (row.querySelector('.tp-nature') || {}).value || '',
      type: row.querySelector('.tp-type').value,
      L:    parseFloat(row.querySelector('.tp-l').value) || 0,
      W:    parseFloat(row.querySelector('.tp-w').value) || 0,
      // Code court : il NOMME les mini-terrains posés dessus. Vide → déduit du nom à l'usage.
      code: String(((row.querySelector('.tp-code') || {}).value || '')).trim().toUpperCase(),
      // Orientation sur le plan, en degrés. La fiche est la source enregistrée : la poignée ⟲
      // écrit dans ce champ, elle ne tient pas une valeur à part.
      rot:  parseFloat((row.querySelector('.tp-rot') || {}).value) || 0,
      // Position sur le plan (m). ⭐ La FICHE est la source : le glisser y écrit, le clavier aussi.
      //   Un champ vide reste vide (et non 0) : il déclenche le placement automatique.
      x:    lireNombreOuVide(row.querySelector('.tp-x')),
      y:    lireNombreOuVide(row.querySelector('.tp-y')),
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
        w: parseFloat(row.querySelector('.dim-w').value) || 0,
        // En-but de la catégorie, derrière CHAQUE ligne de but. 0 / vide = aucun déclaré.
        enBut: parseFloat((row.querySelector('.dim-enbut') || {}).value) || 0
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
  rafraichirIndicesTerrains();
}

/**
 * Remet à jour les deux repères qui SUIVENT la saisie sans être recalculés par le tableau :
 * le gabarit au sol de chaque catégorie, et le rappel « MUN-1, MUN-2… » sous le code court.
 * ⛔ Ils vivent dans des lignes que le rendu ne réécrit pas : sans cet appel, l'organisateur
 *    verrait un gabarit d'avant sa dernière frappe.
 */
function rafraichirIndicesTerrains() {
  const dims = lireDimensionsDuFormulaire();
  Object.keys(dims).forEach(function (cat) {
    const cible = document.querySelector('[data-role="ausol-' + (window.CSS && CSS.escape ? CSS.escape(cat) : cat) + '"]');
    if (!cible) return;
    const g = gabaritCategorie(dims[cat]);
    cible.textContent = (g && !g.plein && g.l > 0 && g.w > 0) ? 'au sol : ' + g.l + ' × ' + g.w + ' m' : '';
  });
  const codes = construireCodes(lireTerrainsDuFormulaire());
  document.querySelectorAll('#liste-terrains-physiques .terrain-ligne').forEach(function (row, i) {
    const aide = row.querySelector('.terr-aide');
    if (aide) aide.textContent = 'nomme les mini-terrains : ' + codes[i] + '-1, ' + codes[i] + '-2…';
  });
}

/* --- Écouteurs délégués posés sur #zone-terrains (voir initAdmin) --- */
function onZoneTerrainsInput(evenement) {
  if (evenement && evenement.target.closest && evenement.target.closest('#terrains-sorties')) return;
  recalculerCapacite();
  if (typeof invaliderPackTerrains === 'function') invaliderPackTerrains();
}

function onZoneTerrainsChange(evenement) {
  if (evenement.target.closest && evenement.target.closest('#terrains-sorties')) return;
  if (evenement.target.classList.contains('dim-plein')) {
    const taille = evenement.target.closest('.dim-ligne').querySelector('.dim-taille');
    if (taille) taille.hidden = evenement.target.checked; // masque L×W si « terrain entier »
  }
  recalculerCapacite();
  if (typeof invaliderPackTerrains === 'function') invaliderPackTerrains();
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
  if (suppr) { onSupprimerTerrainPhysique(suppr); return; }
  if (evenement.target.id === 'bouton-enregistrer-terrains') { onEnregistrerPlanTerrains(); return; }
  if (evenement.target.id === 'bouton-repartir') { onRepartir(); return; }
  if (evenement.target.id === 'bouton-appliquer-repartition') { onAppliquerRepartition(); return; }
}

/**
 * Retire une fiche de grand terrain, APRÈS confirmation.
 * ⛔ CE QUI N'ALLAIT PAS. Un clic retirait la fiche sur-le-champ, avec tout ce qui y était saisi et sans
 *   aucun moyen de revenir en arrière — vérifié dans un vrai Chromium. Ce n'est pas une écriture serveur,
 *   mais c'est bien une SAISIE perdue, et l'application demande confirmation partout ailleurs pour moins
 *   que cela. ⭐ Le focus revient sur « + Ajouter un grand terrain » : la fiche qui le portait a disparu.
 */
async function onSupprimerTerrainPhysique(bouton) {
  const fiche = bouton.closest('.cv-terrain-detail');
  if (!fiche) return;
  const ligne = fiche.querySelector('.terrain-ligne');
  const nom = ((ligne && ligne.querySelector('.tp-nom')) || {}).value || '';
  const ok = await dialogConfirmer('Retirer le grand terrain « ' + (nom.trim() || 'sans nom') + ' » de la liste ?\n\n' +
    'Tout ce qui est saisi sur cette fiche sera perdu. Rien n’est enregistré tant que tu ne cliques pas ' +
    'sur « Enregistrer les terrains ».', { ok: 'Retirer', danger: true });
  if (!ok) return;
  fiche.remove();
  recalculerCapacite();
  const ajouter = document.getElementById('bouton-ajouter-terrain');
  if (ajouter && ajouter.focus) ajouter.focus();
}

function ajouterTerrainPhysique() {
  const liste = document.getElementById('liste-terrains-physiques');
  if (!liste) return;
  const i = liste.querySelectorAll('.terrain-ligne').length;
  // ⭐ La nouvelle fiche s'ouvre et prend le focus (lot « Terrains »). ⛔ Elle arrivait REPLIÉE et le
  //   focus restait sur le bouton : à la souris il fallait un second clic pour la déplier, et au
  //   clavier l'organisateur ne savait pas où il venait d'atterrir.
  liste.insertAdjacentHTML('beforeend',
    ligneTerrainPhysique({ nom: 'Terrain ' + (i + 1), type: 'rugby', L: 100, W: 68, pos: '',
      code: 'T' + (i + 1) }, i, true));
  recalculerCapacite();
  // ⚠️ Les fiches forment un accordéon EXCLUSIF (`<details name="terrain-physique">`) : un navigateur
  //   REFERME une fiche insérée déjà ouverte quand une autre du groupe l'est — vérifié dans Chrome, où
  //   l'attribut `open` posé au balisage ne suffisait pas. On l'ouvre donc par la propriété, APRÈS
  //   l'insertion : c'est ce chemin-là qui referme les autres, comme un clic de l'organisateur.
  const fiches = liste.querySelectorAll('.cv-terrain-detail');
  const fiche = fiches[fiches.length - 1];
  if (fiche) fiche.open = true;
  const champ = fiche && fiche.querySelector('.tp-nom');
  if (champ && champ.focus) champ.focus();
}

/** Enregistre le plan des terrains (grands terrains + couloir + tailles de catégorie). */
/* Délai NOMINAL des deux écritures de l'écran. ⛔ Sans lui, une réponse qui ne vient jamais laissait
   « Enregistrer les terrains » sur « Enregistrement… » POUR TOUJOURS — vérifié dans un vrai Chromium,
   bouton encore bloqué après 37 s. À échéance : le bouton se libère et le message dit que
   l'enregistrement n'est pas confirmé. ⛔ Aucun renvoi automatique (api.js ne rejoue pas ces écritures). */
const DELAI_ECRITURE_TERRAINS_MS = 30000;

/* ⭐ UNE OPÉRATION À LA FOIS, fenêtre de confirmation COMPRISE — la protection acquise au lot
   « Équipes ». Sans elle, `onAppliquerRepartition` était ré-entrante : un second déclenchement pendant
   la question rouvrait une fenêtre et relançait toute la série d'écritures. */
let terrainsOperationEnCours = false;
function avecOperationTerrains(geste) {
  if (terrainsOperationEnCours) return Promise.resolve(false);
  terrainsOperationEnCours = true;
  return Promise.resolve().then(geste).finally(function () { terrainsOperationEnCours = false; });
}

/**
 * Échec d'une écriture de l'écran. Un refus du SERVEUR (réponse lue) reste tel quel : rien n'a été écrit.
 * ⛔ Une réponse PERDUE (délai, connexion coupée, page illisible) peut cacher une écriture réussie :
 *   jamais de renvoi automatique ; le message le dit, et la saisie reste à l'écran.
 */
function erreurEcritureTerrains(erreur, quoi) {
  const perdue = erreur && !erreur.reponse && (erreur.name === 'AbortError' || erreur.name === 'TypeError' ||
    erreur.name === 'SyntaxError' || /erreur \(\d{3}\)/.test(String(erreur.message || '')));
  if (!perdue) return erreur;
  const cause = erreur.name === 'AbortError' ? 'aucune réponse du serveur dans le délai'
    : erreur.name === 'TypeError' ? 'connexion interrompue' : String(erreur.message || 'réponse illisible').replace(/\.$/, '');
  return new Error('Enregistrement non confirmé (' + cause + '). ' + quoi + ' reste à l’écran : ' +
    'un nouveau clic l’enregistre, sans risque de doublon.');
}

/** Enregistre le plan des terrains (grands terrains + couloir + tailles de catégorie). */
async function onEnregistrerPlanTerrains() {
  const message = document.getElementById('message-terrains');
  const bouton = document.getElementById('bouton-enregistrer-terrains');
  const terrains = lireTerrainsDuFormulaire().map(function (t) {
    // ⭐ La position vient désormais de la FICHE (champs X / Y, remplis par le glisser comme au clavier).
    //   La mémoire du module ne sert plus que de repli : un terrain placé par la grille automatique et
    //   jamais déplacé garde ainsi exactement le comportement d'avant.
    if (t.x !== undefined && t.y !== undefined) return t;
    const p = positionsTerrains[t.code];
    return p ? Object.assign({}, t, { x: p.x, y: p.y }) : t;
  });
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
    let res;
    try { res = await ecrireAdmin('enregistrerPlanTerrains', data, { delaiMs: DELAI_ECRITURE_TERRAINS_MS }); }
    catch (erreur) { throw erreurEcritureTerrains(erreur, 'Ton plan'); }
    // ⭐ L'écran suit ce que le SERVEUR a relu (contrat `ecriture-v1`) ; avec un backend d'avant le
    //   contrat, les valeurs envoyées, exactement comme avant.
    const relu = (res && res.contrat === 'ecriture-v1' && res.enregistre) ? res.enregistre : data;
    configCourante.global = Object.assign({}, configCourante.global, data, relu);
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
/* Empreinte du dernier placement explicitement validé. Les sorties bénévoles ne sont disponibles
   que tant que la géométrie courante porte exactement cette empreinte. */
let empreintePlacementTerrainsValide = '';

/** Nombre d'équipes par catégorie (d'après les équipes saisies). */
function equipesParCategorie() {
  const map = {};
  (equipesCourantes || []).forEach(function (e) {
    const c = String(e.categorie);
    map[c] = (map[c] || 0) + 1;
  });
  return map;
}

/* Mots qui ne distinguent pas un terrain d'un autre : ils ne peuvent pas former son code. */
const MOTS_VIDES_TERRAIN = ['TERRAIN', 'STADE', 'COMPLEXE', 'PLATEAU', 'LE', 'LA', 'LES', 'DU',
  'DE', 'DES', 'D', 'L', 'AU', 'AUX', 'SUR', 'ET', 'EN'];

/**
 * Code court PROPOSÉ pour un terrain, déduit de son nom de fiche.
 *
 * ⛔ CE QUI NE MARCHAIT PAS AVANT. L'ancien `prefixeTerrain` prenait la PREMIÈRE lettre du nom
 * plus son chiffre final — un schéma taillé pour les noms par défaut « Rugby 1 / Foot 2 ». Dès
 * que l'organisateur nomme ses terrains pour de vrai, « Terrain Municipal », « Terrain du
 * Racing » et « Terrain de foot de l'entrée » donnaient tous T1, T2, T3 : le nom de la fiche
 * disparaissait complètement des mini-terrains.
 *
 * ⭐ LA RÈGLE RETENUE : le DERNIER mot distinctif, sur trois lettres, plus le chiffre final s'il
 * y en a un. C'est le mot qui nomme vraiment le terrain, « Terrain » et les articles n'étant
 * jamais distinctifs. « Terrain du Racing » → RAC, « Terrain de foot de l'entrée » → ENT,
 * « Rugby 1 » → RUG1. Ce n'est qu'une PROPOSITION : le champ reste modifiable dans la fiche.
 */
function codeTerrainAuto(nom, i) {
  const brut = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const mots = brut.split(/[^A-Z0-9]+/).filter(Boolean);
  const suffixe = mots.length && /^\d+$/.test(mots[mots.length - 1]) ? mots[mots.length - 1] : '';
  const lettres = mots.filter(function (m) {
    return /[A-Z]/.test(m) && MOTS_VIDES_TERRAIN.indexOf(m) === -1;
  });
  if (!lettres.length) return 'T' + (Number(i) + 1);
  return lettres[lettres.length - 1].slice(0, 3) + suffixe;
}

/** Codes RETENUS, un par terrain : celui de la fiche s'il est saisi, sinon la proposition.
 *  Deux terrains ne peuvent pas porter le même : un suffixe numérique les sépare. */
function construireCodes(fields) {
  const vus = {};
  return fields.map(function (f, i) {
    let c = String((f && f.code) || '').trim().toUpperCase() || codeTerrainAuto(f && f.nom, i);
    if (vus[c]) { let k = 2; while (vus[c + k]) k++; c = c + k; }
    vus[c] = true; return c;
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
    // (moyenne sur les grands terrains restants).
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
 *  (numérotés via ctx.numero). */
function poserTerrainSolo(ctx, f, code, cat, estPlein) {
  if (estPlein) {                                       // U14 : le match occupe tout le terrain
    ctx.numero++; const id = String(ctx.numero);
    ctx.parCategorie[cat.name].push(id);
    return { field: f, code: code, mode: 'plein', zones: [{ cat: cat.name, color: ctx.couleur[cat.name],
      tiles: [marquerEnBut({ id: id, x: 0, y: 0, w: f.L, h: f.W, label: cat.name + ' · ' + id }, cat.tile)],
      table: null }] };
  }
  const rects = packerZone(0, 0, f.L, f.W, cat.tile, ctx.m); // packing à orientations mixtes
  if (rects.length === 0) ctx.avert.push(f.nom + ' : trop petit pour un terrain ' + cat.name + '.');
  const tiles = [];                                        // tous les mini-terrains sont jouables
  rects.forEach(function (r) {
    if (ctx.parCategorie[cat.name].length >= ctx.budget[cat.name]) return; // plafond équipes atteint
    ctx.numero++; const id = String(ctx.numero);
    tiles.push(marquerEnBut({ id: id, x: r.x, y: r.y, w: r.w, h: r.h, label: id }, cat.tile));
    ctx.parCategorie[cat.name].push(id);
  });
  return { field: f, code: code, mode: 'solo', zones: [{ cat: cat.name, color: ctx.couleur[cat.name],
    tiles: tiles, table: null }] };
}

/** Pose DEUX catégories sur un grand terrain SCINDÉ en deux moitiés (coupe
 *  gauche/droite si le terrain est large, haut/bas sinon) : packing par moitié. */
function poserTerrainScinde(ctx, f, code, cA, cB) {
  const horizontal = f.L >= f.W;                        // terrain large → coupe gauche/droite
  const zones = [];
  function demi(cat, ox, oy, zL, zW) {
    const rects = packerZone(ox, oy, zL, zW, cat.tile, ctx.m); // packing à orientations mixtes
    if (rects.length === 0) ctx.avert.push(f.nom + ' (demi) : trop petit pour ' + cat.name + '.');
    const tiles = [];                                    // tous les mini-terrains sont jouables
    rects.forEach(function (r) {
      if (ctx.parCategorie[cat.name].length >= ctx.budget[cat.name]) return; // plafond équipes atteint
      ctx.numero++; const id = String(ctx.numero);
      tiles.push(marquerEnBut({ id: id, x: r.x, y: r.y, w: r.w, h: r.h, label: id }, cat.tile));
      ctx.parCategorie[cat.name].push(id);
    });
    zones.push({ cat: cat.name, color: ctx.couleur[cat.name], tiles: tiles, table: null });
  }
  if (horizontal) {
    const hL = (f.L - ctx.m) / 2;
    demi(cA, 0, 0, hL, f.W);
    demi(cB, hL + ctx.m, 0, hL, f.W);
  } else {
    const hW = (f.W - ctx.m) / 2;
    demi(cA, 0, 0, f.L, hW);
    demi(cB, 0, hW + ctx.m, f.L, hW);
  }
  return { field: f, code: code, mode: 'split', zones: zones };
}

/**
 * Étape 4 — Attribution des files aux grands terrains PHYSIQUES (solo d'abord,
 * puis scindés). Les terrains solo sont attribués de façon à MAXIMISER le nombre
 * de mini-terrains : chaque catégorie reçoit les grands terrains où elle « rentre »
 * le mieux (une catégorie à petits terrains profite d'un grand terrain).
 * @return fieldsPlan  la liste des grands terrains posés (pour la carte)
 */
function attribuerGrandsTerrains(ctx, fields, codes, soloQueue, paires, F) {
  const fieldsPlan = [];
  const dispo = fields.map(function (f, i) { return i; }); // indices de grands terrains libres

  // Catégories « plein » (U14) : un terrain entier = 1 match quel que soit sa taille → n'importe quel terrain.
  soloQueue.filter(function (s) { return s.plein; }).forEach(function (s) {
    if (!dispo.length) return;
    const i = dispo.shift();
    fieldsPlan.push(poserTerrainSolo(ctx, fields[i], codes[i], s.cat, true));
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
      fieldsPlan.push(poserTerrainSolo(ctx, fields[c.i], codes[c.i], catParNom[c.nom], false));
    }
  });
  const restants = dispo.filter(function (i) { return !prise[i]; });

  // Terrains à SCINDER (deux catégories) : sur les grands terrains restants.
  let r = 0;
  paires.forEach(function (p) {
    if (r >= restants.length) return;
    const i = restants[r++];
    fieldsPlan.push(poserTerrainScinde(ctx, fields[i], codes[i], p[0], p[1]));
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
      fp.zones.forEach(function (z) { z.tiles.forEach(function (t) { occ.push(t); }); });
      const nouv = placerDansLibre(fp.field.L, fp.field.W, occ, pire.tile.l, pire.tile.w, ctx.m, 1);
      if (!nouv.length) continue;
      const r = nouv[0]; ctx.numero++; const id = String(ctx.numero);
      const tuile = marquerEnBut({ id: id, x: r.x, y: r.y, w: r.w, h: r.h, label: id }, pire.tile);
      ctx.parCategorie[pire.name].push(id);
      let zone = fp.zones.find(function (z) { return z.cat === pire.name; });
      if (zone) { zone.tiles.push(tuile); }
      else {
        fp.zones.push({ cat: pire.name, color: ctx.couleur[pire.name], tiles: [tuile], table: null });
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
 * la position de chaque mini-terrain pour la carte.
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

  const codes = construireCodes(fields);
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
  const fieldsPlan = attribuerGrandsTerrains(ctx, fields, codes, files.soloQueue, files.paires, F);

  // 5) Mixage en secours si une catégorie reste nettement plus chargée que les autres.
  mixerEnSecours(ctx, fieldsPlan, normaux);

  // 6) Nettoyage : le plafond « équipes » peut laisser une zone SANS mini-terrain (un grand terrain
  //    attribué à une catégorie qui avait déjà atteint son plafond ailleurs). On retire ces zones
  //    vides ; un grand terrain devenu entièrement vide n'est plus dessiné (terrain non utilisé).
  const fieldsPropres = [];
  fieldsPlan.forEach(function (fp) {
    fp.zones = fp.zones.filter(function (z) { return z.tiles.length; });
    if (fp.zones.length === 1 && fp.mode === 'split') fp.mode = 'solo';
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
  // ⭐ `tile` est le GABARIT AU SOL (en-but compris), pas la surface de jeu : tout le moteur de
  //   packing en aval manipule donc l'encombrement RÉEL des mini-terrains.
  const cats = categoriesPresentes().map(function (n) {
    return { name: n, teams: teams[n] || 0, tile: gabaritCategorie(dims[n]) };
  }).filter(function (c) { return c.tile && (c.tile.plein || (c.tile.l > 0 && c.tile.w > 0)); });

  if (fields.length === 0) { cont.innerHTML = '<div class="repart-avert">⚠️ Déclare au moins un grand terrain valide.</div>'; return; }
  if (cats.length === 0) { cont.innerHTML = '<div class="repart-avert">⚠️ Aucune catégorie avec une taille de terrain valide.</div>'; return; }

  const tm = lireTailleTM();
  repartitionCalculee = allouerTerrains(fields, cats, m, tm.l, tm.w);
  empreintePlacementTerrainsValide = '';
  // Grands terrains déclarés mais non retenus par l'attribution : dessinés VIDES sur la carte,
  // pour servir de cibles au glisser-déposer de l'ajustement manuel.
  const codesVides = construireCodes(fields);
  fields.forEach(function (f, i) {
    const deja = repartitionCalculee.fieldsPlan.some(function (fp) { return fp.field === f; });
    if (!deja) repartitionCalculee.fieldsPlan.push({ field: f, code: codesVides[i], mode: 'solo', zones: [] });
  });
  // Contexte de l'ajustement manuel (mêmes données que le calcul : dimensions, couloir, TM).
  repartitionCalculee.ctxManuel = { cats: cats, m: m, tmL: tm.l, tmW: tm.w };
  repartitionCalculee.misDeCote = [];
  initialiserTablesMarquesLibres(repartitionCalculee);
  // ⭐ Point de passage UNIQUE des identifiants : le calcul les a posés avec un compteur global,
  //   la renumérotation leur donne leur nom définitif « CODE-n ». Sans cet appel, le premier
  //   affichage montrerait des numéros et les suivants des codes.
  renumeroterRepartition(repartitionCalculee);
  afficherRepartition(repartitionCalculee, cats);
}

/** Une table par grand terrain, visible immédiatement et indépendante du packing des mini-terrains. */
function initialiserTablesMarquesLibres(res) {
  const ctx = res.ctxManuel || {};
  const tmL = ctx.tmL > 0 ? ctx.tmL : TM_L_DEFAUT;
  const tmW = ctx.tmW > 0 ? ctx.tmW : TM_W_DEFAUT;
  (res.fieldsPlan || []).forEach(function (fp) {
    (fp.zones || []).forEach(function (z) { z.table = null; });
    fp.table = {
      x: Math.max(0, (fp.field.L - tmL) / 2),
      y: Math.max(0, (fp.field.W - tmW) / 2),
      w: Math.min(tmL, fp.field.L),
      h: Math.min(tmW, fp.field.W)
    };
  });
  res.tablesPosees = false;
}

/** Tout ce qui réserve la place d'un mini-terrain. La table, libre, n'entre pas dans ce calcul. */
function obstaclesDuTerrain(fp) {
  const occ = [];
  (fp.zones || []).forEach(function (z) {
    z.tiles.forEach(function (t) { occ.push(t); });
  });
  return occ;
}

/** Une modification du plan rend la validation obsolète sans déplacer la table choisie. */
function invaliderPlacementTerrains(res) {
  if (!res) return;
  res.tablesPosees = false;
  empreintePlacementTerrainsValide = '';
  if (typeof invaliderPackTerrains === 'function') invaliderPackTerrains();
}

/** Affiche le résumé + la carte + le bouton « Appliquer ». */
function afficherRepartition(res, cats) {
  if (empreintePlacementTerrainsValide && typeof empreintePackTerrains === 'function' &&
      empreintePackTerrains(res) !== empreintePlacementTerrainsValide) {
    empreintePlacementTerrainsValide = '';
  }
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

  h += '<div class="carte-outils">' +
         '<span class="carte-outils-titre">Plan du site</span>' +
         '<span class="carte-aide">Glissez la <strong>plaque de nom</strong> pour déplacer un terrain, la poignée <strong>⟲</strong> pour l’orienter (pas de 15°, libre avec Alt), la zone <strong>TM</strong> pour placer librement la table de marque, et le badge <strong>⟳</strong> d’un mini-terrain pour le faire pivoter sur place.<br>' +
           '⌨️ <strong>Au clavier</strong> : <kbd>Tab</kbd> atteint chaque mini-terrain. Posé — <kbd>Entrée</kbd> le met de côté, ' +
           '<kbd>R</kbd> le pivote, les <kbd>flèches</kbd> le déplacent de 1 m (5 m avec <kbd>Maj</kbd>). Mis de côté — ' +
           '<kbd>Entrée</kbd> le pose, <kbd>R</kbd> le pivote, <kbd>T</kbd> change de grand terrain. ' +
           'Sur une table — les <kbd>flèches</kbd> la déplacent de 1 m (5 m avec <kbd>Maj</kbd>). ' +
           '<kbd>Échap</kbd> annule le dernier geste.</span>' +
         '<span class="carte-zoom">' +
           '<button type="button" class="bouton-icone" id="carte-zoom-moins" aria-label="Réduire le plan">−</button>' +
           '<span id="carte-zoom-valeur">' + Math.round(carteZoom * 100) + ' %</span>' +
           '<button type="button" class="bouton-icone" id="carte-zoom-plus" aria-label="Agrandir le plan">+</button>' +
           '<button type="button" class="bouton-lien" id="carte-zoom-ajuste">Ajuster</button>' +
         '</span></div>';
  h += '<div class="repart-carte-wrap" id="repartition-carte">' + dessinerCarte(res) + '</div>';

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
        const ouverture = '<span class="repart-chip" data-chip="' + i + '" role="button" tabindex="0"' +
          ' aria-label="' + echapper(nomAccessibleChip(c)) + '" style="border-color:' + c.color + '">';
        if (c.plein) {
          return ouverture + '<span class="repart-puce" style="background:' + c.color + '"></span>' +
            echapper(c.cat) + ' · terrain entier</span>';
        }
        const d = dimensionsChip(c);
        return ouverture + '<span class="repart-puce" style="background:' + c.color + '"></span>' +
          echapper(c.cat) + ' · ' + Math.round(d.w) + '×' + Math.round(d.h) + ' m' +
          '<button type="button" class="repart-chip-pivot" data-pivot="' + i + '" ' +
          'title="Pivoter (longueur ↔ largeur)" aria-label="Pivoter ce mini-terrain">⟳</button></span>';
      }).join('') + '</div>';
  }

  h += '<div class="ligne-action">';
  if (!res.tablesPosees) {
    h += '<button type="button" class="bouton" id="bouton-valider-placement">📍 Valider le placement</button>';
  } else {
    h += '<button type="button" class="bouton" id="bouton-appliquer-repartition">✅ Appliquer aux catégories</button>';
  }
  h += '<span id="message-repartition" class="message-form"></span></div>';

  if (!res.tablesPosees) {
    h += '<p class="note-generation">La zone grise <strong>« TM »</strong> représente la table de marque : ' +
         '<strong>une seule par grand terrain</strong>. Son placement est entièrement libre sur le grand ' +
         'terrain : fais-la glisser où tu le souhaites. Elle ne réserve aucune place, ne contraint pas ' +
         'les mini-terrains et n’est jamais placée automatiquement dans un en-but. Valide lorsque le ' +
         'plan te convient.</p>';
  } else {
    h += '<p class="note-generation">La zone grise <strong>« TM »</strong> = table de marque : ' +
         '<strong>une seule par grand terrain</strong>, même quand deux catégories s\'y partagent la ' +
         'place. Sa position est celle choisie sur la carte, sans calcul automatique ni réservation ' +
         'd’espace. Si tu la déplaces, le plan devra simplement être validé de nouveau.</p>';
  }

  if (typeof htmlSortiesTerrains === 'function') {
    h += htmlSortiesTerrains(res, empreintePlacementTerrainsValide);
  }

  document.getElementById('repartition-resultat').innerHTML = h;

  // Glisser-déposer des mini-terrains mis de côté (pointerdown : souris ET tactile).
  const tray = document.getElementById('repart-tray');
  if (tray) { tray.addEventListener('pointerdown', onChipPointerDown); tray.addEventListener('keydown', onClavierPlan); }
  // ⭐ La carte étant réécrite en entier à chaque rendu, ses écouteurs se reposent ici — comme
  //    ceux des pastilles juste au-dessus. Posés sur le CONTENEUR, ils survivent aux redessins
  //    de la seule carte (`redessinerCarte`).
  brancherPlanLibre();
  if (typeof brancherSortiesTerrains === 'function') brancherSortiesTerrains();
  const zoomBloc = document.querySelector('.carte-zoom');
  if (zoomBloc) zoomBloc.addEventListener('click', function (ev) {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'carte-zoom-moins') reglerZoomCarte(carteZoom / 1.25);
    else if (b.id === 'carte-zoom-plus') reglerZoomCarte(carteZoom * 1.25);
    else if (b.id === 'carte-zoom-ajuste') reglerZoomCarte(1);
  });
  // ⭐ Le panneau vient d'être réécrit : on rend le focus au mini-terrain que le clavier suivait.
  rendreFocusApresRendu();
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

/**
 * Renomme TOUS les mini-terrains et reconstruit parCategorie. Idempotent.
 *
 * ⭐ L'identifiant porte le CODE COURT DU GRAND TERRAIN qui l'accueille, puis son rang sur ce
 * terrain : MUN-1, MUN-2, RAC-1. C'est cet identifiant qui part dans le champ « Terrains » des
 * catégories, donc dans la colonne `terrain` de chaque match : il se lit ensuite sur le planning,
 * à la table de marque et sur la page publique. Un numéro seul ne disait pas OÙ l'on joue.
 * ⛔ Le rang repart de 1 sur CHAQUE terrain : « MUN-3 » se situe sur le terrain MUN, sans avoir à
 *    consulter une table de correspondance.
 */
function renumeroterRepartition(res) {
  const par = {};
  Object.keys(res.parCategorie || {}).forEach(function (c) { par[c] = []; });
  res.fieldsPlan.forEach(function (fp, i) {
    const code = String(fp.code || codeTerrainAuto((fp.field || {}).nom, i));
    let rang = 0;
    fp.zones.forEach(function (z) {
      z.tiles.forEach(function (t) {
        rang++; t.id = code + '-' + rang;
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
    if (res.tablesPosees) invaliderPlacementTerrains(res);
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
  // ⛔ ET IL DOIT ÊTRE DEDANS. Le dépôt à la souris passe par `positionExacte`, qui borne déjà
  //    l'emplacement ; la rotation sur place, elle, calcule la nouvelle emprise autour du centre
  //    et peut la faire déborder. Sans ce contrôle, un mini-terrain se retrouvait en x négatif,
  //    c'est-à-dire hors du terrain, sans que rien ne le signale.
  if (spot.x < -0.001 || spot.y < -0.001 ||
      spot.x + spot.w > fp.field.L + 0.001 || spot.y + spot.h > fp.field.W + 0.001) {
    return 'il sortirait du terrain';
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
    const tuile = marquerEnBut({ id: '0', x: spot.x, y: spot.y, w: spot.w, h: spot.h, label: '' },
      tuileCategorieManuel(res, chip.cat));
    const zone = fp.zones.find(function (z) { return z.cat === chip.cat; });
    if (zone) zone.tiles.push(tuile);
    else {
      fp.zones.push({ cat: chip.cat, color: chip.color, tiles: [tuile], table: null });
      if (fp.zones.length > 1) fp.mode = 'split';
    }
  }
  res.misDeCote.splice(iChip, 1);
  if (res.tablesPosees) invaliderPlacementTerrains(res);
  renumeroterRepartition(res);
  afficherRepartition(res, ctx.cats);
  return true;
}

/** « Valider le placement » : fige la disposition, y compris les tables de marque libres.
 *  Des mini-terrains laissés de côté ne bloquent PAS : c'est un choix légitime (terrain qu'on ne
 *  souhaite pas utiliser). On le rappelle simplement — la journée sera plus longue, et le système
 *  d'arbitrage le vérifiera à la génération du planning. */
function onValiderPlacement() {
  const res = repartitionCalculee;
  if (!res || !res.ctxManuel) return;
  const restants = (res.misDeCote || []).length;
  res.tablesPosees = true;
  empreintePlacementTerrainsValide = typeof empreintePackTerrains === 'function'
    ? empreintePackTerrains(res) : '';
  afficherRepartition(res, res.ctxManuel.cats);
  afficherMessage(document.getElementById('message-repartition'),
    restants
      ? '✅ Placement validé — ' + restants + ' mini-terrain(s) laissé(s) de côté ne seront pas ' +
        'utilisés. Moins de terrains = journée plus longue : l\'arbitrage des horaires le vérifiera ' +
        'à la génération du planning.'
      : '✅ Placement validé, tables de marque comprises.', 'ok');
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

  // Étiquette suiveuse (hors carte) et aperçu DANS la carte. ⭐ L'aperçu est un rect SVG posé
  // dans le groupe TOURNÉ du terrain visé : il hérite ainsi de son orientation, là où une boîte
  // HTML serait restée horizontale au-dessus d'un terrain de biais.
  const apercu = document.createElement('div');
  apercu.className = 'repart-apercu';
  document.body.appendChild(apercu);
  const fantome = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fantome.setAttribute('class', 'carte-apercu');
  let dernierEv = evenement;

  function terrainSous(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    return (el && el.closest) ? el.closest('g[data-terrain]') : null;
  }
  function nettoyerCible() {
    document.querySelectorAll('.carte-terrain.est-cible').forEach(function (r) { r.classList.remove('est-cible'); });
    if (fantome.parentNode) fantome.parentNode.removeChild(fantome);
  }
  /**
   * Emplacement visé (en mètres) sous le pointeur, ou null hors d'un terrain.
   * ⭐ La conversion passe par la MATRICE du rect de référence, pas par sa boîte englobante :
   * sous rotation, cette boîte est celle, alignée sur les axes de l'écran, qui ENTOURE le
   * terrain tourné — elle plaçait le mini-terrain à côté dès le premier degré d'inclinaison.
   */
  function vise(ev) {
    const g = terrainSous(ev);
    if (!g) return null;
    const iField = parseInt(g.getAttribute('data-terrain'), 10);
    const fp = res.fieldsPlan[iField];
    const rect = g.querySelector('.carte-terrain');
    if (!fp || !rect) return null;
    const m = metresSousPointeur(fp, rect, ev.clientX, ev.clientY);
    if (!m) return null;
    return { g: g, iField: iField, fp: fp, ppm: m.ppm, xm: m.xm, ym: m.ym };
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
    // L'aperçu vit dans le repère du terrain : mètres × échelle, et la rotation vient du groupe.
    apercu.className = 'repart-apercu est-libre est-etiquette';
    apercu.style.left = ev.clientX + 'px'; apercu.style.top = ev.clientY + 'px';
    apercu.style.width = ''; apercu.style.height = '';
    apercu.textContent = Math.round(spot.w) + '×' + Math.round(spot.h) + (refus ? ' — ' + refus : '');
    fantome.setAttribute('x', (spot.x * v.ppm).toFixed(1));
    fantome.setAttribute('y', (spot.y * v.ppm).toFixed(1));
    fantome.setAttribute('width', Math.max(2, spot.w * v.ppm).toFixed(1));
    fantome.setAttribute('height', Math.max(2, spot.h * v.ppm).toFixed(1));
    fantome.setAttribute('data-refus', refus ? 'oui' : 'non');
    const pivot = v.g.querySelector('.carte-pivot') || v.g;
    if (fantome.parentNode !== pivot) pivot.appendChild(fantome);
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
const POS_GRILLE = { HG: [0, 0], HC: [1, 0], HD: [2, 0], CG: [0, 1], CC: [1, 1], CD: [2, 1], BG: [0, 2], BC: [1, 2], BD: [2, 2] };/* ============================================================================
 *  LA CARTE — un plan de site, pas une grille de cases
 * ============================================================================
 *  ⛔ CE QUI N'ALLAIT PAS. Le plan se dessinait à ~1,4 px/m dans des cellules de 165 px, plafonné
 *  à 520 px par le CSS, et chaque terrain n'avait que NEUF positions possibles (une grille 3×3),
 *  sans aucune orientation. Un site réel n'est jamais aligné sur une grille : celui de la démo a
 *  ses terrains de biais, dont un à ~35°. Faute de rotation, l'organisateur en était réduit à
 *  ÉCHANGER longueur et largeur pour simuler un quart de tour — ce qui fait déclarer « 68 m »
 *  la longueur d'un terrain de rugby de 110 m.
 *
 *  ⭐ CE QUI EST FAIT ICI. Un repère de SITE en mètres : chaque terrain porte sa position `x`,`y`
 *  et son angle `rot`, tous deux libres. La carte se dessine à l'échelle de la place disponible,
 *  avec un zoom. Les terrains posés par l'ancienne grille 3×3 gardent leur arrangement au premier
 *  affichage, puis deviennent déplaçables : rien à ressaisir.
 *
 *  ⛔ LE CONTRAT DU GLISSER-DÉPOSER, et il a changé de nature. Il ne tient plus à
 *  `getBoundingClientRect()` : sous rotation, cette boîte est celle, alignée sur les axes, qui
 *  ENTOURE le terrain tourné — elle donnait un point de dépôt faux dès le premier degré. La
 *  conversion passe désormais par la matrice de l'élément (`getScreenCTM`), exacte pour
 *  n'importe quelle transformation. Restent nécessaires :
 *    · un groupe `g[data-terrain="i"]` par grand terrain ;
 *    · UN rect `.carte-terrain` par groupe, à l'origine du repère tourné ;
 *    · un groupe `g[data-tuile][data-field]` par mini-terrain.
 * ========================================================================== */

/* Pelouse : une seule teinte pour les deux sports — ce sont les MARQUAGES qui distinguent un
   terrain de rugby d'un terrain de football, pas la couleur de l'herbe. */
const CARTE_HERBE = '#4a8a4e';
const CARTE_HERBE_BANDE = '#529557';
/* Herbe du MINI-terrain : plus sombre, et surtout OPAQUE. Un mini-terrain tracé sur un grand le
   recouvre réellement — laisser voir au travers la ligne des 22 m ou le rond central du terrain
   porteur donnait un empilement de traits qui n'existe pas sur le gazon. */
const CARTE_HERBE_MINI = '#3f7a43';
const CARTE_HERBE_MINI_BANDE = '#468249';
const CARTE_LIGNE = '#ffffff';
const CARTE_BANDE_M = 8;            // largeur d'une bande de tonte (m)
const TERRAIN_ECART_DEFAUT = 25;    // m entre deux terrains repris de l'ancienne grille
const CARTE_ZOOM_MIN = 0.5, CARTE_ZOOM_MAX = 4;

/* Zoom du plan (1 = ajusté à la largeur disponible) et positions libres mémorisées par CODE.
   ⛔ Portées par le module : la carte est redessinée à chaque ajustement, un repère posé dans le
   DOM disparaîtrait avec elle et le terrain reviendrait à sa place d'origine sous les doigts. */
let carteZoom = 1;
let positionsTerrains = {};

/** Angle d'un terrain, normalisé dans [0,360[. Tout ce qui n'est pas un nombre vaut 0. */
function angleTerrain(f) {
  const a = parseFloat((f || {}).rot);
  return Number.isFinite(a) ? ((a % 360) + 360) % 360 : 0;
}

/** Les quatre coins d'un terrain dans le repère du site, rotation comprise (autour du centre). */
function coinsTerrain(f) {
  const a = angleTerrain(f) * Math.PI / 180;
  const cx = (f.x || 0) + f.L / 2, cy = (f.y || 0) + f.W / 2;
  const cos = Math.cos(a), sin = Math.sin(a);
  return [[f.x || 0, f.y || 0], [(f.x || 0) + f.L, f.y || 0],
          [(f.x || 0) + f.L, (f.y || 0) + f.W], [f.x || 0, (f.y || 0) + f.W]]
    .map(function (p) {
      const dx = p[0] - cx, dy = p[1] - cy;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    });
}

/** Boîte englobante d'un terrain tourné, dans le repère du site. */
function boiteTerrain(f) {
  const c = coinsTerrain(f);
  return { x0: Math.min.apply(null, c.map(function (p) { return p[0]; })),
           y0: Math.min.apply(null, c.map(function (p) { return p[1]; })),
           x1: Math.max.apply(null, c.map(function (p) { return p[0]; })),
           y1: Math.max.apply(null, c.map(function (p) { return p[1]; })) };
}

/**
 * Donne une position de site à tout terrain qui n'en a pas.
 * ⭐ REPRISE SANS RESSAISIE : un terrain enregistré avant le plan libre n'a que son emplacement
 * sur l'ancienne grille 3×3. On le convertit en mètres, une seule fois, en gardant l'arrangement
 * — il apparaît là où l'organisateur l'attend, et devient déplaçable.
 */
function assurerPositionsTerrains(fields) {
  const pas = Math.max.apply(null, fields.map(function (f) {
    return Math.max(f.L || 0, f.W || 0);
  }).concat([100])) + TERRAIN_ECART_DEFAUT;
  const occ = {};
  fields.forEach(function (f, i) {
    // ⭐ ORDRE VOULU : la position SAISIE dans la fiche d'abord (c'est la source enregistrée, et
    //   l'organisateur peut la taper), la mémoire du module ensuite, l'ancienne grille en dernier.
    //   ⛔ L'inverse ignorait une valeur tapée au clavier tant qu'un glisser n'avait pas eu lieu.
    if (!Number.isFinite(parseFloat(f.x)) || !Number.isFinite(parseFloat(f.y))) {
      const memo = positionsTerrains[f.code];
      if (memo) { f.x = memo.x; f.y = memo.y; }
    }
    if (Number.isFinite(parseFloat(f.x)) && Number.isFinite(parseFloat(f.y))) {
      f.x = parseFloat(f.x); f.y = parseFloat(f.y);
      positionsTerrains[f.code] = { x: f.x, y: f.y };
      return;
    }
    const p = POS_GRILLE[f.pos] || [1, 1];
    let col = p[0]; const row = p[1];
    let cle = col + ',' + row;
    while (occ[cle]) { col++; cle = col + ',' + row; }
    occ[cle] = true;
    f.x = col * pas; f.y = row * pas;
  });
  return fields;
}

/** Les défs communes de la carte : hachure d'en-but et ombre portée des terrains. */
function defsCarte() {
  return '<defs>' +
    '<pattern id="carte-hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" fill="#3d7542"/>' +
      '<line x1="0" y1="0" x2="0" y2="6" stroke="#6aa86e" stroke-width="1.6"/></pattern>' +
    '<filter id="carte-ombre" x="-8%" y="-8%" width="120%" height="125%">' +
      '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0b3d17" flood-opacity="0.28"/>' +
    '</filter></defs>';
}

/** Marquages propres au sport, dans le repère du grand terrain (0,0 → fw,fh). */
function marquagesTerrain(type, fw, fh) {
  const L = CARTE_LIGNE;
  let g = '<line x1="' + (fw / 2).toFixed(1) + '" y1="0" x2="' + (fw / 2).toFixed(1) + '" y2="' + fh.toFixed(1) +
          '" stroke="' + L + '" stroke-width="1.4" stroke-opacity="0.75"/>';
  if (type === 'foot') {
    const r = Math.min(fw, fh) * 0.11;
    g += '<circle cx="' + (fw / 2).toFixed(1) + '" cy="' + (fh / 2).toFixed(1) + '" r="' + r.toFixed(1) +
         '" fill="none" stroke="' + L + '" stroke-width="1.2" stroke-opacity="0.7"/>';
    const sw = fw * 0.16, sh = fh * 0.45;
    [0, fw - sw].forEach(function (x) {
      g += '<rect x="' + x.toFixed(1) + '" y="' + ((fh - sh) / 2).toFixed(1) + '" width="' + sw.toFixed(1) +
           '" height="' + sh.toFixed(1) + '" fill="none" stroke="' + L + '" stroke-width="1.2" stroke-opacity="0.7"/>';
    });
  } else {
    [fw * 0.22, fw * 0.78].forEach(function (x) {
      g += '<line x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + fh.toFixed(1) +
           '" stroke="' + L + '" stroke-width="1.2" stroke-opacity="0.6" stroke-dasharray="5 4"/>';
    });
  }
  return g;
}

/**
 * Le NOM ACCESSIBLE d'un mini-terrain POSÉ : sa catégorie, son identifiant, le grand terrain qui le
 * porte, ses cotes, puis les touches disponibles. ⛔ C'est ce que lit un lecteur d'écran : sans lui,
 * la carte n'était qu'un dessin muet.
 */
function nomAccessibleTuile(t, z, iField) {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan && res.fieldsPlan[iField];
  const terrain = fp && fp.field ? String(fp.field.nom || fp.code || '') : '';
  return z.cat + ' · ' + t.id + ', posé sur ' + terrain + ', ' + Math.round(t.w) + ' sur ' + Math.round(t.h) +
    ' mètres. Entrée pour le mettre de côté, R pour le pivoter, flèches pour le déplacer, Échap pour annuler.';
}

/** Le NOM ACCESSIBLE d'un mini-terrain MIS DE CÔTÉ (pastille). */
function nomAccessibleChip(chip) {
  if (chip.plein) {
    return chip.cat + ', terrain entier, mis de côté. Entrée pour le poser, T pour changer de grand terrain, ' +
      'Échap pour annuler.';
  }
  const d = dimensionsChip(chip);
  return chip.cat + ', ' + Math.round(d.w) + ' sur ' + Math.round(d.h) + ' mètres, mis de côté. ' +
    'Entrée pour le poser, R pour le pivoter, T pour changer de grand terrain, Échap pour annuler.';
}

/** Un mini-terrain : en-but hachuré, surface de jeu tracée, contour de catégorie, étiquette. */
function tuileCarte(t, z, ppm, iField) {
  const x = t.x * ppm, yy = t.y * ppm, w = t.w * ppm, hh = t.h * ppm;
  const clipT = 'carte-clipt-' + iField + '-' + String(t.id).replace(/[^A-Za-z0-9_-]/g, '');
  const nom = nomAccessibleTuile(t, z, iField);
  let g = '<g class="carte-tuile-g" data-field="' + iField + '" data-tuile="' + echapper(String(t.id)) + '"' +
          ' role="button" tabindex="0" aria-label="' + echapper(nom) + '">' +
          '<title>' + echapper(nom) + '</title>';
  // L'emprise entière, OPAQUE : elle masque les marquages du grand terrain en dessous.
  g += '<clipPath id="' + clipT + '"><rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) +
       '" width="' + w.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="2"/></clipPath>';
  g += '<rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hh.toFixed(1) +
       '" rx="2" fill="' + CARTE_HERBE_MINI + '"/>';
  // Sa propre tonte, dans son propre sens : le mini-terrain se lit comme un terrain à part.
  g += '<g clip-path="url(#' + clipT + ')">';
  const bandeT = Math.max(6, hh / 5);
  for (let by = yy + bandeT; by < yy + hh; by += bandeT * 2) {
    g += '<rect x="' + x.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + w.toFixed(1) +
         '" height="' + Math.min(bandeT, yy + hh - by).toFixed(1) + '" fill="' + CARTE_HERBE_MINI_BANDE + '"/>';
  }
  g += '</g>';
  const ebT = (parseFloat(t.eb) || 0) * ppm;
  const surX = t.ebAxe === 'x';
  if (ebT > 0.5) {
    (surX ? [[x, yy, ebT, hh], [x + w - ebT, yy, ebT, hh]]
          : [[x, yy, w, ebT], [x, yy + hh - ebT, w, ebT]]).forEach(function (b) {
      g += '<rect x="' + b[0].toFixed(1) + '" y="' + b[1].toFixed(1) + '" width="' + b[2].toFixed(1) +
           '" height="' + b[3].toFixed(1) + '" class="carte-enbut"><title>En-but ' + echapper(z.cat) +
           ' (' + t.eb + ' m)</title></rect>';
    });
  }
  const jx = ebT > 0.5 && surX ? x + ebT : x, jy = ebT > 0.5 && !surX ? yy + ebT : yy;
  const jw = ebT > 0.5 && surX ? w - 2 * ebT : w, jh = ebT > 0.5 && !surX ? hh - 2 * ebT : hh;
  // La surface de jeu : lignes blanches sur l'herbe du mini-terrain, sans voile de couleur —
  // c'est le contour de catégorie et la pastille qui portent l'appartenance.
  g += '<rect x="' + jx.toFixed(1) + '" y="' + jy.toFixed(1) + '" width="' + jw.toFixed(1) + '" height="' + jh.toFixed(1) +
       '" fill="none" stroke="' + CARTE_LIGNE + '" stroke-width="1.4" stroke-opacity="0.92"/>';
  if (jw > 26 && jh > 18) {
    const mx = surX ? jx + jw / 2 : jx, my = surX ? jy : jy + jh / 2;
    g += '<line x1="' + (surX ? mx : jx).toFixed(1) + '" y1="' + (surX ? jy : my).toFixed(1) +
         '" x2="' + (surX ? mx : jx + jw).toFixed(1) + '" y2="' + (surX ? jy + jh : my).toFixed(1) +
         '" stroke="' + CARTE_LIGNE + '" stroke-width="1" stroke-opacity="0.55"/>';
  }
  g += '<rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hh.toFixed(1) +
       '" rx="2" fill="none" stroke="' + z.color + '" stroke-width="2.5" class="carte-tuile-cadre"/>';
  if (w > 44 && hh > 26) {
    const lab = String(t.label || t.id);
    const avecCat = hh > 46 && lab.indexOf(z.cat) === -1;
    const lw = Math.max(34, Math.max(lab.length, avecCat ? z.cat.length : 0) * 6.6 + 14);
    const lh = avecCat ? 30 : 18;
    g += '<rect x="' + (x + w / 2 - lw / 2).toFixed(1) + '" y="' + (yy + hh / 2 - lh / 2).toFixed(1) +
         '" width="' + lw.toFixed(1) + '" height="' + lh + '" rx="' + (avecCat ? 8 : 9) + '" fill="' + z.color + '"/>' +
         '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (yy + hh / 2 + (avecCat ? -1 : 4)).toFixed(1) +
         '" class="carte-tuile">' + echapper(lab) + '</text>';
    // ⛔ Jamais la couleur seule : la catégorie est ÉCRITE dès qu'il y a la place, sans quoi deux
    //    catégories sur un même terrain ne se distingueraient que par la teinte du contour.
    if (avecCat) {
      g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (yy + hh / 2 + 11).toFixed(1) +
           '" class="carte-tuile-cat">' + echapper(z.cat) + '</text>';
    }
  }
  g += '</g>';
  // ⭐ Le bouton ⟳ vit HORS du groupe cliquable : dans le groupe, le clic mettrait le
  //    mini-terrain de côté au lieu de le faire pivoter.
  if (w > 40 && hh > 34) {
    g += '<g class="carte-tuile-rot" data-rot-field="' + iField + '" data-rot-tuile="' + echapper(String(t.id)) + '">' +
         '<title>Pivoter ce mini-terrain sur place</title>' +
         '<circle cx="' + (x + w - 11).toFixed(1) + '" cy="' + (yy + 11).toFixed(1) + '" r="9"/>' +
         '<text x="' + (x + w - 11).toFixed(1) + '" y="' + (yy + 15).toFixed(1) + '">⟳</text></g>';
  }
  return g;
}

/** Dessine UN grand terrain à sa position de site, tourné de son angle. */
function groupeTerrain(fp, ppm, iField, ox, oy) {
  const f = fp.field;
  const fw = f.L * ppm, fh = f.W * ppm;
  const rot = angleTerrain(f);
  const catsF = fp.zones.map(function (z) { return z.cat; }).join(' / ');
  const code = String(fp.code || '');
  const clip = 'carte-clip-' + iField;

  // La plaque se place au-dessus de la boîte ENGLOBANTE du terrain tourné, et ne tourne PAS :
  // un nom de terrain à 35° ne se lit pas.
  const b = boiteTerrain(f);
  const px = (b.x0 - (f.x || 0)) * ppm, py = (b.y0 - (f.y || 0)) * ppm;

  let g = '<g transform="translate(' + ox.toFixed(1) + ',' + oy.toFixed(1) + ')" data-terrain="' + iField + '">';

  g += '<g class="carte-plaque" data-plaque="' + iField + '" transform="translate(' + px.toFixed(1) + ',' + py.toFixed(1) + ')">' +
       '<title>Faire glisser pour déplacer ce terrain sur le plan</title>';
  const largeurCode = Math.max(26, code.length * 7 + 12);
  if (code) {
    g += '<rect x="0" y="-21" width="' + largeurCode + '" height="16" rx="4" class="carte-code-fond"/>' +
         '<text x="' + (largeurCode / 2).toFixed(1) + '" y="-9" class="carte-code">' + echapper(code) + '</text>';
  }
  g += '<text x="' + (code ? largeurCode + 7 : 0) + '" y="-9" class="carte-titre">' +
       '<tspan class="carte-nomterrain">' + echapper(f.nom) + '</tspan>' +
       '<tspan class="carte-metaterrain"> · ' + echapper(String(f.L)) + ' × ' + echapper(String(f.W)) + ' m' +
       (rot ? ' · ' + Math.round(rot) + '°' : '') + (catsF ? ' · ' + echapper(catsF) : '') + '</tspan></text></g>';
  // Poignée de rotation : posée au coin haut-droit de la boîte englobante, hors du terrain.
  g += '<g class="carte-rot" data-rot="' + iField + '" transform="translate(' +
       ((b.x1 - (f.x || 0)) * ppm + 12).toFixed(1) + ',' + (py + 4).toFixed(1) + ')">' +
       '<title>Faire glisser pour orienter le terrain (pas de 15°, libre avec Alt)</title>' +
       '<circle cx="0" cy="0" r="11"/><text x="0" y="4">⟲</text></g>';

  g += '<g class="carte-pivot" transform="rotate(' + rot.toFixed(2) + ',' + (fw / 2).toFixed(1) + ',' + (fh / 2).toFixed(1) + ')">';
  g += '<clipPath id="' + clip + '"><rect x="0" y="0" width="' + fw.toFixed(1) + '" height="' + fh.toFixed(1) + '" rx="3"/></clipPath>';
  g += '<rect x="0" y="0" width="' + fw.toFixed(1) + '" height="' + fh.toFixed(1) + '" rx="3" fill="' + CARTE_HERBE +
       '" filter="url(#carte-ombre)"/>';
  g += '<g clip-path="url(#' + clip + ')">';
  const bande = CARTE_BANDE_M * ppm;
  for (let x = bande; x < fw; x += bande * 2) {
    g += '<rect x="' + x.toFixed(1) + '" y="0" width="' + Math.min(bande, fw - x).toFixed(1) +
         '" height="' + fh.toFixed(1) + '" fill="' + CARTE_HERBE_BANDE + '"/>';
  }
  g += marquagesTerrain(f.type, fw, fh) + '</g>';
  // ⛔ LE RECT DE RÉFÉRENCE : à l'origine du repère tourné, c'est sa matrice que la conversion
  //    écran → mètres inverse. Il reçoit aussi `.est-cible` au survol d'un dépôt.
  g += '<rect x="0" y="0" width="' + fw.toFixed(1) + '" height="' + fh.toFixed(1) + '" rx="3" class="carte-terrain"/>';

  fp.zones.forEach(function (z) {
    z.tiles.forEach(function (t) { g += tuileCarte(t, z, ppm, iField); });
  });

  if (fp.table) {
    const cxT = (fp.table.x + fp.table.w / 2) * ppm, cyT = (fp.table.y + fp.table.h / 2) * ppm;
    const tw = Math.max(fp.table.w * ppm, 22), th = Math.max(fp.table.h * ppm, 16);
    g += '<g class="carte-table-g" data-table-field="' + iField + '" role="button" tabindex="0" ' +
         'aria-label="Table de marque de ' + echapper(f.nom) + ', position ' + Math.round(fp.table.x) +
         ' par ' + Math.round(fp.table.y) + ' mètres. Faire glisser ou utiliser les flèches pour la déplacer.">' +
         '<rect x="' + (cxT - tw / 2).toFixed(1) + '" y="' + (cyT - th / 2).toFixed(1) + '" width="' + tw.toFixed(1) +
         '" height="' + th.toFixed(1) + '" rx="3" class="carte-table"><title>Table de marque libre du terrain</title></rect>';
    if (tw > 20 && th > 12) g += '<text x="' + cxT.toFixed(1) + '" y="' + (cyT + 4).toFixed(1) + '" class="carte-tm">TM</text>';
    g += '</g>';
  }
  g += '</g></g>';
  return g;
}

/** Règle graduée : donne l'échelle du plan, sans laquelle un terrain n'est qu'un rectangle. */
function echelleCarte(x, y, ppm) {
  const metres = ppm * 50 < 60 ? 20 : 50;
  const w = metres * ppm;
  return '<g class="carte-echelle" transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')">' +
    '<line x1="0" y1="0" x2="' + w.toFixed(1) + '" y2="0"/>' +
    '<line x1="0" y1="-4" x2="0" y2="4"/><line x1="' + w.toFixed(1) + '" y1="-4" x2="' + w.toFixed(1) + '" y2="4"/>' +
    '<text x="' + (w + 7).toFixed(1) + '" y="4">' + metres + ' m</text></g>';
}

/**
 * Dessine le plan du site. L'échelle s'ajuste à la place disponible ; `carteZoom` l'agrandit
 * ensuite, le conteneur prenant le relais en défilement — c'est ce qui rend le zoom RÉEL :
 * agrandir le viewBox seul n'aurait rien changé, le navigateur le ramenant à la largeur du bloc.
 */
function dessinerCarte(res) {
  const fps = res.fieldsPlan;
  if (!fps.length) return '';
  assurerPositionsTerrains(fps.map(function (fp) { return fp.field; }));

  const pad = 16, plaqueH = 30, echelleH = 30;
  const boites = fps.map(function (fp) { return boiteTerrain(fp.field); });
  const x0 = Math.min.apply(null, boites.map(function (b) { return b.x0; }));
  const y0 = Math.min.apply(null, boites.map(function (b) { return b.y0; }));
  const x1 = Math.max.apply(null, boites.map(function (b) { return b.x1; }));
  const y1 = Math.max.apply(null, boites.map(function (b) { return b.y1; }));
  const largeurSite = Math.max(1, x1 - x0), hauteurSite = Math.max(1, y1 - y0);

  // Place réellement disponible, mesurée dans la page : le zoom 1 remplit le bloc, ni plus ni moins.
  const bloc = document.getElementById('repartition-carte') || document.getElementById('repartition-resultat');
  const dispo = Math.max(320, ((bloc && bloc.clientWidth) || 1040) - 2 * pad - 40);
  const ppm = dispo / largeurSite;

  const vw = largeurSite * ppm + 2 * pad + 40;
  const vh = hauteurSite * ppm + 2 * pad + plaqueH + echelleH;
  const parts = fps.map(function (fp, i) {
    return groupeTerrain(fp, ppm, i,
      pad + (fp.field.x - x0) * ppm, pad + plaqueH + (fp.field.y - y0) * ppm);
  });
  return '<svg viewBox="0 0 ' + vw.toFixed(0) + ' ' + vh.toFixed(0) + '" width="' + (vw * carteZoom).toFixed(0) +
         '" height="' + (vh * carteZoom).toFixed(0) + '" class="carte-svg" data-ppm="' + ppm.toFixed(4) +
         '" role="img" aria-label="Plan du site : terrains et mini-terrains">' +
         defsCarte() + parts.join('') + echelleCarte(pad, vh - 14, ppm) + '</svg>';
}

/* ==========================================================================
   PLAN LIBRE — déplacer, orienter, zoomer
   --------------------------------------------------------------------------
   Trois gestes, trois poignées distinctes, pour qu'aucun ne se déclenche par
   surprise : la PLAQUE de nom déplace le terrain, la poignée ⟲ l'oriente, le
   badge ⟳ d'un mini-terrain le fait pivoter sur place. Le corps du terrain
   reste libre pour le dépôt des mini-terrains, et un clic sur un mini-terrain
   continue de le mettre de côté.
   ========================================================================== */

/**
 * Point écran → coordonnées LOCALES d'un élément SVG, rotation et échelle comprises.
 * ⭐ C'est la brique qui remplace `getBoundingClientRect()` : cette boîte-là est alignée sur les
 * axes de l'écran, donc fausse dès qu'un terrain est tourné. La matrice, elle, est exacte.
 */
function pointLocalSvg(el, clientX, clientY) {
  const svg = el && (el.ownerSVGElement || (el.tagName === 'svg' ? el : null));
  if (!svg || !svg.createSVGPoint || !el.getScreenCTM) return null;
  const ctm = el.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(ctm.inverse());
}

/** Mètres sous le pointeur dans le repère d'un grand terrain, ou null hors de la carte. */
function metresSousPointeur(fp, rect, clientX, clientY) {
  const p = pointLocalSvg(rect, clientX, clientY);
  if (!p) return null;
  const fw = rect.width && rect.width.baseVal ? rect.width.baseVal.value : 0;
  if (!(fw > 0) || !(fp.field.L > 0)) return null;
  const ppm = fw / fp.field.L;
  return { xm: p.x / ppm, ym: p.y / ppm, ppm: ppm };
}

/** Maintient la table dans le grand terrain sans lui appliquer les règles des mini-terrains. */
function bornerPositionTable(fp, x, y) {
  const table = fp.table || {};
  return {
    x: Math.max(0, Math.min(x, Math.max(0, fp.field.L - (table.w || 0)))),
    y: Math.max(0, Math.min(y, Math.max(0, fp.field.W - (table.h || 0))))
  };
}

/** Déplacement libre d'une table de marque, sans recherche de place ni collision. */
function demarrerDeplacementTable(evenement, iField) {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan[iField];
  const groupe = evenement.target.closest('g[data-terrain]');
  const rect = groupe && groupe.querySelector('.carte-terrain');
  if (!fp || !fp.table || !rect) return;
  evenement.preventDefault();
  evenement.stopPropagation();
  const depart = metresSousPointeur(fp, rect, evenement.clientX, evenement.clientY);
  if (!depart) return;
  const x0 = fp.table.x, y0 = fp.table.y;
  let aBouge = false;
  function bouger(ev) {
    const p = metresSousPointeur(fp, rect, ev.clientX, ev.clientY);
    if (!p) return;
    const prochaine = bornerPositionTable(fp, x0 + p.xm - depart.xm, y0 + p.ym - depart.ym);
    if (Math.abs(prochaine.x - fp.table.x) < 0.001 && Math.abs(prochaine.y - fp.table.y) < 0.001) return;
    if (!aBouge) { invaliderPlacementTerrains(res); aBouge = true; }
    fp.table.x = prochaine.x;
    fp.table.y = prochaine.y;
    redessinerCarte();
  }
  function finir() {
    document.removeEventListener('pointermove', bouger);
    document.removeEventListener('pointerup', finir);
    document.removeEventListener('pointercancel', finir);
    if (!aBouge) return;
    focusApresRendu = { type: 'table', index: iField };
    afficherRepartition(res, res.ctxManuel.cats);
  }
  document.addEventListener('pointermove', bouger);
  document.addEventListener('pointerup', finir);
  document.addEventListener('pointercancel', finir);
}

/** Redessine la seule carte, sans toucher au reste du panneau (plus rapide, et sans clignotement). */
function redessinerCarte() {
  const bloc = document.getElementById('repartition-carte');
  if (!bloc || !repartitionCalculee) return;
  bloc.innerHTML = dessinerCarte(repartitionCalculee);
}

/** Reporte la position d'un terrain dans sa fiche (source enregistrée, et lue par l'assistant). */
function ecrirePositionDansFiche(iField, x, y) {
  const lignes = document.querySelectorAll('#liste-terrains-physiques .terrain-ligne');
  const row = lignes[iField];
  if (!row) return;
  const cx = row.querySelector('.tp-x'), cy = row.querySelector('.tp-y');
  if (cx) cx.value = String(Math.round(x));
  if (cy) cy.value = String(Math.round(y));
}

/** Déplacement d'un grand terrain par sa plaque de nom. */
function demarrerDeplacementTerrain(evenement, iField) {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan[iField];
  const svg = evenement.target.closest('svg');
  if (!fp || !svg) return;
  evenement.preventDefault();
  if (typeof invaliderPackTerrains === 'function') invaliderPackTerrains();
  const ppm = parseFloat(svg.getAttribute('data-ppm')) || 1;
  const depart = pointLocalSvg(svg, evenement.clientX, evenement.clientY);
  if (!depart) return;
  const x0 = fp.field.x, y0 = fp.field.y;
  function bouger(ev) {
    const p = pointLocalSvg(document.querySelector('#repartition-carte svg'), ev.clientX, ev.clientY);
    if (!p) return;
    fp.field.x = x0 + (p.x - depart.x) / ppm;
    fp.field.y = y0 + (p.y - depart.y) / ppm;
    positionsTerrains[fp.field.code] = { x: fp.field.x, y: fp.field.y };
    // ⭐ La fiche reste la source enregistrée — comme pour l'orientation. Sans ces deux lignes, le
    //   détecteur de « modifications non enregistrées » ne voyait pas le déplacement et le laissait
    //   se perdre en silence au changement d'écran.
    ecrirePositionDansFiche(iField, fp.field.x, fp.field.y);
    redessinerCarte();
  }
  function finir() {
    document.removeEventListener('pointermove', bouger);
    document.removeEventListener('pointerup', finir);
    document.removeEventListener('pointercancel', finir);
  }
  document.addEventListener('pointermove', bouger);
  document.addEventListener('pointerup', finir);
  document.addEventListener('pointercancel', finir);
}

/** Orientation d'un grand terrain par sa poignée ⟲ : pas de 15°, libre avec Alt. */
function demarrerRotationTerrain(evenement, iField) {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan[iField];
  if (!fp) return;
  evenement.preventDefault();
  if (typeof invaliderPackTerrains === 'function') invaliderPackTerrains();
  const svg = evenement.target.closest('svg');
  const ppm = parseFloat(svg.getAttribute('data-ppm')) || 1;
  const groupe = svg.querySelector('g[data-terrain="' + iField + '"]');
  function centre() {
    const m = groupe.getScreenCTM();
    const p = svg.createSVGPoint();
    p.x = fp.field.L / 2 * ppm; p.y = fp.field.W / 2 * ppm;
    return p.matrixTransform(m);
  }
  const c = centre();
  const angle0 = angleTerrain(fp.field);
  const depart0 = Math.atan2(evenement.clientY - c.y, evenement.clientX - c.x) * 180 / Math.PI;
  function bouger(ev) {
    const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x) * 180 / Math.PI;
    let angle = angle0 + (a - depart0);
    if (!ev.altKey) angle = Math.round(angle / 15) * 15;   // aimanté, sauf si Alt
    fp.field.rot = ((angle % 360) + 360) % 360;
    const champ = document.querySelectorAll('#liste-terrains-physiques .tp-rot')[iField];
    if (champ) champ.value = Math.round(fp.field.rot);      // la fiche reste la source enregistrée
    redessinerCarte();
  }
  function finir() {
    document.removeEventListener('pointermove', bouger);
    document.removeEventListener('pointerup', finir);
    document.removeEventListener('pointercancel', finir);
  }
  document.addEventListener('pointermove', bouger);
  document.addEventListener('pointerup', finir);
  document.addEventListener('pointercancel', finir);
}

/**
 * Fait pivoter SUR PLACE un mini-terrain déjà posé : longueur et largeur s'échangent autour de
 * son centre. ⛔ Refusé si la nouvelle emprise sort du terrain ou mord le couloir — le
 * mini-terrain reste où il est, plutôt que d'être déplacé ailleurs sans le dire.
 */
function pivoterMiniTerrain(iField, id) {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan[iField];
  const message = document.getElementById('message-repartition');
  if (!fp || !res.ctxManuel) return;
  for (let zi = 0; zi < fp.zones.length; zi++) {
    const z = fp.zones[zi];
    const t = z.tiles.find(function (x) { return String(x.id) === String(id); });
    if (!t) continue;
    // Pivot autour du CENTRE, puis on ramène l'emprise dans le terrain : un quart de tour près
    // d'un bord déborderait sinon, et le geste serait refusé alors qu'il suffisait de glisser.
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const spot = { x: cx - t.h / 2, y: cy - t.w / 2, w: t.h, h: t.w };
    spot.x = Math.max(0, Math.min(spot.x, fp.field.L - spot.w));
    spot.y = Math.max(0, Math.min(spot.y, fp.field.W - spot.h));
    // On compare aux autres occupants : la tuile elle-même ne doit pas se gêner.
    const autres = { zones: fp.zones.map(function (zz) {
      return { tiles: zz.tiles.filter(function (x) { return x !== t; }), table: zz.table };
    }), table: fp.table, field: fp.field };
    const refus = refusPlacement(autres, spot, res.ctxManuel.m);
    if (refus) {
      afficherMessage(message, '⚠️ ' + t.id + ' ne peut pas pivoter ici : ' + refus + '.', 'ko');
      return;
    }
    t.x = spot.x; t.y = spot.y; t.w = spot.w; t.h = spot.h;
    if (t.ebAxe) t.ebAxe = t.ebAxe === 'x' ? 'y' : 'x';
    if (res.tablesPosees) invaliderPlacementTerrains(res);
    afficherRepartition(res, res.ctxManuel.cats);
    return;
  }
}


/* ==========================================================================
   TERRAINS — LE PLAN AU CLAVIER (lot « Terrains », 2ᵉ passage)
   --------------------------------------------------------------------------
   ⛔ CE QUI N'ALLAIT PAS. La carte offrait à la souris quatre fonctions — mettre de côté, reposer,
   déplacer, pivoter — et AUCUNE n'était atteignable au clavier : la campagne Chromium relevait
   « 0 élément focalisable » pour cinq mini-terrains dessinés. Un organisateur qui n'utilise pas la
   souris ne pouvait donc pas composer son plan du tout.
   ⭐ CE QUI EST FAIT ICI. Chaque mini-terrain — posé sur la carte ou mis de côté — est un bouton
   focalisable, porteur d'un NOM ACCESSIBLE qui dit sa catégorie, son identifiant, et s'il est posé
   (et où) ou mis de côté. Les gestes de la souris ont tous leur équivalent :

     Sur un mini-terrain POSÉ          Sur une pastille MISE DE CÔTÉ
     ─────────────────────────         ──────────────────────────────
     Entrée / Espace : mettre de côté  Entrée / Espace : le poser sur le terrain visé
     R              : pivoter sur place R              : pivoter (longueur ↔ largeur)
     ← ↑ → ↓        : déplacer de 1 m   T              : changer de grand terrain d'accueil
     Maj + flèche   : déplacer de 5 m
     Échap          : annuler le dernier geste clavier (des deux côtés)

   ⛔ Tout refus est ANNONCÉ avec sa raison (hors terrain, couloir non respecté, terrain occupé en
   entier) et NE DÉPLACE RIEN : c'est la même règle que l'aperçu vert/rouge du glisser.
   ⭐ Le focus est RENDU après chaque repeint : le panneau est réécrit en entier à chaque geste, et
   sans cela le clavier retombait sur le début de la page à chaque touche.
   ⛔ Aucun de ces gestes ne parle au serveur.
   ========================================================================== */

/* Le pas de déplacement au clavier, en mètres (Maj = pas long). */
const PAS_CLAVIER_M = 1, PAS_CLAVIER_LONG_M = 5;

/* Le grand terrain visé par « Entrée » depuis une pastille ; `T` en change. */
let terrainViseClavier = 0;

/* Le plan AVANT le dernier geste clavier — `{ etat: <JSON>, focus: <descripteur> }` — pour Échap.
   ⭐ Le FOCUS d'alors est mémorisé avec l'état : annuler sans le rendre renverrait le clavier au début
   de la page, exactement le défaut que ce lot corrige par ailleurs. */
let etatAvantGesteClavier = null;

/* Ce qu'il faut refocaliser après le prochain rendu : {type:'tuile', id} ou {type:'chip', index}. */
let focusApresRendu = null;

/** Le refus que l'écran vient d'afficher, sans son pictogramme — pour l'annoncer sans le redire. */
function refusAffiche_() {
  const zone = document.getElementById('message-repartition');
  return String((zone && zone.textContent) || '').replace(/^⚠️\s*/, '').trim();
}

/** Annonce un résultat au lecteur d'écran (zone `aria-live` HORS du panneau réécrit). */
function annoncerClavier(texte) {
  const zone = document.getElementById('repart-annonce');
  if (zone) zone.textContent = texte;
}

/** Ce que le clavier suit en ce moment : un mini-terrain posé, une pastille, ou rien. */
function descripteurFocusPlan() {
  const a = document.activeElement;
  if (!a || !a.closest) return null;
  const t = a.closest('g[data-tuile]');
  if (t) return { type: 'tuile', id: t.getAttribute('data-tuile') };
  const table = a.closest('g[data-table-field]');
  if (table) return { type: 'table', index: parseInt(table.getAttribute('data-table-field'), 10) || 0 };
  const c = a.closest('.repart-chip');
  if (c) return { type: 'chip', index: parseInt(c.getAttribute('data-chip'), 10) || 0 };
  return null;
}

/** Mémorise l'état du plan ET le focus avant un geste clavier : Échap y revient. */
function memoriserAvantGesteClavier() {
  try { etatAvantGesteClavier = { etat: JSON.stringify(repartitionCalculee), focus: descripteurFocusPlan() }; }
  catch (e) { etatAvantGesteClavier = null; }
}

/** Échap : revient à l'état d'avant le dernier geste clavier. Une seule fois. */
function annulerGesteClavier() {
  if (!etatAvantGesteClavier) { annoncerClavier('Rien à annuler.'); return; }
  const memo = etatAvantGesteClavier;
  let restaure = null;
  try { restaure = JSON.parse(memo.etat); } catch (e) { restaure = null; }
  etatAvantGesteClavier = null;
  if (!restaure) { annoncerClavier('Rien à annuler.'); return; }
  repartitionCalculee = restaure;
  focusApresRendu = memo.focus;
  afficherRepartition(repartitionCalculee, repartitionCalculee.ctxManuel.cats);
  annoncerClavier('Dernier geste annulé.');
}

/** Rend le focus après un rendu du panneau (le panneau est réécrit en entier à chaque geste). */
function rendreFocusApresRendu() {
  const cible = focusApresRendu;
  focusApresRendu = null;
  if (!cible) return;
  let el = null;
  if (cible.type === 'tuile') {
    const tous = document.querySelectorAll('#repartition-carte g[data-tuile]');
    for (let i = 0; i < tous.length; i++) {
      if (tous[i].getAttribute('data-tuile') === String(cible.id)) { el = tous[i]; break; }
    }
  } else if (cible.type === 'chip') {
    const chips = document.querySelectorAll('#repart-tray .repart-chip');
    el = chips[Math.min(cible.index, chips.length - 1)] || null;
  } else if (cible.type === 'table') {
    el = document.querySelector('#repartition-carte g[data-table-field="' + cible.index + '"]');
  } else if (cible.type === 'id') {
    el = document.getElementById(cible.id);
  }
  if (el && el.focus) el.focus();
}

/** Le mini-terrain posé que désigne un identifiant : { fp, iField, zone, tuile } ou null. */
function trouverTuilePosee(id) {
  const res = repartitionCalculee;
  if (!res) return null;
  for (let i = 0; i < res.fieldsPlan.length; i++) {
    const fp = res.fieldsPlan[i];
    for (let zi = 0; zi < fp.zones.length; zi++) {
      const t = fp.zones[zi].tiles.filter(function (x) { return String(x.id) === String(id); })[0];
      if (t) return { fp: fp, iField: i, zone: fp.zones[zi], tuile: t };
    }
  }
  return null;
}

/** Déplace un mini-terrain POSÉ de (dx, dy) mètres. Refus motivé, sans rien bouger. */
function deplacerTuileClavier(id, dx, dy) {
  const res = repartitionCalculee;
  const trouve = trouverTuilePosee(id);
  if (!trouve || !res.ctxManuel) return;
  const t = trouve.tuile, fp = trouve.fp;
  const spot = { x: t.x + dx, y: t.y + dy, w: t.w, h: t.h };
  // Les AUTRES occupants : la tuile elle-même ne doit pas se gêner.
  const autres = { zones: fp.zones.map(function (zz) {
    return { tiles: zz.tiles.filter(function (x) { return x !== t; }), table: zz.table };
  }), table: fp.table, field: fp.field };
  const refus = refusPlacement(autres, spot, res.ctxManuel.m);
  if (refus) { annoncerClavier(t.id + ' ne peut pas aller là : ' + refus + '.'); return; }
  memoriserAvantGesteClavier();
  t.x = spot.x; t.y = spot.y;
  if (res.tablesPosees) invaliderPlacementTerrains(res);
  focusApresRendu = { type: 'tuile', id: t.id };
  afficherRepartition(res, res.ctxManuel.cats);
  annoncerClavier(t.id + ' déplacé en ' + Math.round(spot.x) + ' ; ' + Math.round(spot.y) + ' mètres.');
}

/** Déplace une table de marque au clavier, librement et sans collision avec les terrains. */
function deplacerTableClavier(iField, dx, dy) {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan[iField];
  if (!fp || !fp.table) return;
  const prochaine = bornerPositionTable(fp, fp.table.x + dx, fp.table.y + dy);
  if (Math.abs(prochaine.x - fp.table.x) < 0.001 && Math.abs(prochaine.y - fp.table.y) < 0.001) {
    annoncerClavier('La table de marque est déjà au bord du terrain.');
    return;
  }
  memoriserAvantGesteClavier();
  fp.table.x = prochaine.x;
  fp.table.y = prochaine.y;
  invaliderPlacementTerrains(res);
  focusApresRendu = { type: 'table', index: iField };
  afficherRepartition(res, res.ctxManuel.cats);
  annoncerClavier('Table de marque déplacée en ' + Math.round(prochaine.x) + ' ; ' +
    Math.round(prochaine.y) + ' mètres sur ' + fp.field.nom + '.');
}

/** Le nom du grand terrain visé par « Entrée » depuis une pastille. */
function nomTerrainVise() {
  const res = repartitionCalculee;
  const fp = res && res.fieldsPlan[terrainViseClavier % res.fieldsPlan.length];
  return fp && fp.field ? String(fp.field.nom || fp.code || '') : '';
}

/** `T` : vise le grand terrain suivant, et l'annonce. */
function changerTerrainViseClavier() {
  const res = repartitionCalculee;
  if (!res || !res.fieldsPlan.length) return;
  terrainViseClavier = (terrainViseClavier + 1) % res.fieldsPlan.length;
  annoncerClavier('Grand terrain d’accueil : ' + nomTerrainVise() +
    ' (' + (terrainViseClavier + 1) + ' sur ' + res.fieldsPlan.length + ').');
}

/**
 * `Entrée` sur une pastille : pose le mini-terrain sur le grand terrain VISÉ s'il y tient, sinon sur
 * le premier suivant qui a la place — et le DIT. ⛔ Si aucun n'a de place, rien n'est posé et la
 * raison du dernier refus est annoncée : jamais de placement silencieux ailleurs.
 */
function poserChipAuClavier(iChip) {
  const res = repartitionCalculee;
  const chip = res && (res.misDeCote || [])[iChip];
  if (!chip || !res.ctxManuel) return;
  const n = res.fieldsPlan.length;
  // ⛔ Un geste REFUSÉ ne doit pas manger l'annulation du geste PRÉCÉDENT : on remet la mémoire
  //   d'annulation telle qu'elle était si rien n'a pu être posé.
  const memoPrecedent = etatAvantGesteClavier;
  let premierRefus = '';
  const noter = function (texte) { if (!premierRefus) premierRefus = texte; };
  for (let k = 0; k < n; k++) {
    const iField = (terrainViseClavier + k) % n;
    const fp = res.fieldsPlan[iField];
    const place = emplacementLibreClavier(fp, chip);
    if (!place) { noter(fp.field.nom + ' : pas de place.'); continue; }
    memoriserAvantGesteClavier();
    const avant = (res.misDeCote || []).length;
    if (!poserMiniTerrainSur(iField, iChip, place.x + place.w / 2, place.y + place.h / 2)) {
      etatAvantGesteClavier = memoPrecedent;
      noter(fp.field.nom + ' : ' + (refusAffiche_() || 'refusé'));
      continue;
    }
    terrainViseClavier = iField;
    // ⭐ Le focus suit le mini-terrain POSÉ : son identifiant n'existe qu'après la renumérotation,
    //   on le retrouve donc par sa position, une fois le panneau réécrit.
    const posee = posePresDe_(fp, place);
    if (posee) focaliserTuile_(posee.id);
    annoncerClavier(chip.cat + ' posé sur ' + fp.field.nom +
      (posee ? ', mini-terrain ' + posee.id : '') + (k ? ', faute de place sur le terrain visé' : '') + '.');
    return;
  }
  etatAvantGesteClavier = memoPrecedent;
  annoncerClavier('Impossible de poser ' + chip.cat + ' : ' + (premierRefus || 'aucun grand terrain n’a la place.') +
    ' R pour le pivoter, T pour viser un autre grand terrain.');
}

/** Le mini-terrain qui occupe (à 0,5 m près) l'emplacement qu'on vient de remplir. */
function posePresDe_(fp, place) {
  let trouve = null;
  (fp.zones || []).forEach(function (z) {
    (z.tiles || []).forEach(function (t) {
      if (!trouve && Math.abs(t.x - place.x) < 0.5 && Math.abs(t.y - place.y) < 0.5) trouve = t;
    });
  });
  return trouve;
}

/** Pose le focus sur un mini-terrain de la carte, maintenant (le panneau est déjà réécrit). */
function focaliserTuile_(id) {
  const tous = document.querySelectorAll('#repartition-carte g[data-tuile]');
  for (let i = 0; i < tous.length; i++) {
    if (tous[i].getAttribute('data-tuile') === String(id)) { if (tous[i].focus) tous[i].focus(); return; }
  }
}

/** Un emplacement libre pour une pastille sur un grand terrain, ou null. Mêmes règles que le glisser. */
function emplacementLibreClavier(fp, chip) {
  const res = repartitionCalculee;
  const ctx = res.ctxManuel;
  const aTuiles = fp.zones.some(function (z) { return z.tiles.length; });
  if (chip.plein) return aTuiles ? null : { x: 0, y: 0, w: fp.field.L, h: fp.field.W };
  if (fp.mode === 'plein' && aTuiles) return null;
  const d = dimensionsChip(chip);
  return placerDansLibre(fp.field.L, fp.field.W, obstaclesDuTerrain(fp), d.w, d.h, ctx.m, 1)[0] || null;
}

/** Les touches du plan : sur un mini-terrain POSÉ (carte) ou sur une pastille MISE DE CÔTÉ. */
function onClavierPlan(evenement) {
  const res = repartitionCalculee;
  if (!res || !res.ctxManuel) return;
  const touche = evenement.key;
  const cible = evenement.target;
  const tuile = cible.closest && cible.closest('g[data-tuile]');
  const table = cible.closest && cible.closest('g[data-table-field]');
  const chip = cible.closest && cible.closest('.repart-chip');
  if (!tuile && !table && !chip) return;
  // ⛔ Le bouton ⟳ de la pastille est un VRAI bouton : on lui laisse Entrée et Espace.
  if (cible.closest && cible.closest('.repart-chip-pivot') && (touche === 'Enter' || touche === ' ')) return;

  if (touche === 'Escape') { evenement.preventDefault(); annulerGesteClavier(); return; }

  if (table) {
    const pasTable = evenement.shiftKey ? PAS_CLAVIER_LONG_M : PAS_CLAVIER_M;
    const sensTable = { ArrowLeft: [-pasTable, 0], ArrowRight: [pasTable, 0],
      ArrowUp: [0, -pasTable], ArrowDown: [0, pasTable] }[touche];
    if (sensTable) {
      evenement.preventDefault();
      deplacerTableClavier(parseInt(table.getAttribute('data-table-field'), 10), sensTable[0], sensTable[1]);
    }
    return;
  }

  if (tuile) {
    const id = tuile.getAttribute('data-tuile');
    const iField = parseInt(tuile.getAttribute('data-field'), 10);
    if (touche === 'Enter' || touche === ' ') {
      evenement.preventDefault();
      memoriserAvantGesteClavier();
      focusApresRendu = { type: 'chip', index: (res.misDeCote || []).length };
      retirerMiniTerrain(iField, id);
      annoncerClavier(id + ' mis de côté. Entrée pour le reposer.');
      return;
    }
    if (touche === 'r' || touche === 'R') {
      evenement.preventDefault();
      memoriserAvantGesteClavier();
      focusApresRendu = { type: 'tuile', id: id };
      const avant = JSON.stringify(trouverTuilePosee(id));
      pivoterMiniTerrain(iField, id);
      const apres = JSON.stringify(trouverTuilePosee(id));
      annoncerClavier(avant === apres ? (refusAffiche_() || id + ' n’a pas pu pivoter ici.') : id + ' pivoté.');
      return;
    }
    const pas = evenement.shiftKey ? PAS_CLAVIER_LONG_M : PAS_CLAVIER_M;
    const sens = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[touche];
    if (sens) { evenement.preventDefault(); deplacerTuileClavier(id, sens[0], sens[1]); }
    return;
  }

  const iChip = parseInt(chip.getAttribute('data-chip'), 10);
  if (touche === 'Enter' || touche === ' ') {
    evenement.preventDefault();
    focusApresRendu = null;
    poserChipAuClavier(iChip);
    return;
  }
  if (touche === 'r' || touche === 'R') {
    evenement.preventDefault();
    memoriserAvantGesteClavier();
    focusApresRendu = { type: 'chip', index: iChip };
    pivoterChip(iChip);
    const c = (repartitionCalculee.misDeCote || [])[iChip];
    annoncerClavier(c ? c.cat + ' pivoté : ' + Math.round(dimensionsChip(c).w) + ' sur ' +
      Math.round(dimensionsChip(c).h) + ' mètres.' : 'Pivoté.');
    return;
  }
  if (touche === 't' || touche === 'T') {
    evenement.preventDefault();
    focusApresRendu = { type: 'chip', index: iChip };
    changerTerrainViseClavier();
  }
}

/** Zoom du plan : molette sur la carte, boutons, ou remise à l'ajusté. */
function reglerZoomCarte(valeur) {
  carteZoom = Math.min(CARTE_ZOOM_MAX, Math.max(CARTE_ZOOM_MIN, valeur));
  redessinerCarte();
  const etiquette = document.getElementById('carte-zoom-valeur');
  if (etiquette) etiquette.textContent = Math.round(carteZoom * 100) + ' %';
}

/** Écouteurs du plan, reposés à chaque rendu du panneau (le bloc est réécrit en entier). */
function brancherPlanLibre() {
  const bloc = document.getElementById('repartition-carte');
  if (!bloc) return;
  bloc.addEventListener('pointerdown', function (ev) {
    const table = ev.target.closest('[data-table-field]');
    if (table) { demarrerDeplacementTable(ev, parseInt(table.getAttribute('data-table-field'), 10)); return; }
    const plaque = ev.target.closest('[data-plaque]');
    if (plaque) { demarrerDeplacementTerrain(ev, parseInt(plaque.getAttribute('data-plaque'), 10)); return; }
    const rot = ev.target.closest('[data-rot]');
    if (rot) { demarrerRotationTerrain(ev, parseInt(rot.getAttribute('data-rot'), 10)); return; }
  });
  bloc.addEventListener('click', function (ev) {
    const rot = ev.target.closest('[data-rot-tuile]');
    if (rot) {
      ev.stopPropagation();   // sinon le clic mettrait aussi le mini-terrain de côté
      pivoterMiniTerrain(parseInt(rot.getAttribute('data-rot-field'), 10), rot.getAttribute('data-rot-tuile'));
    }
  });
  bloc.addEventListener('wheel', function (ev) {
    if (!ev.ctrlKey && !ev.metaKey) return;   // la molette seule fait défiler la page, comme partout
    ev.preventDefault();
    reglerZoomCarte(carteZoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });
  // Le plan AU CLAVIER : même conteneur, mêmes règles que le glisser (voir onClavierPlan).
  bloc.addEventListener('keydown', onClavierPlan);
}

/** « Appliquer aux catégories » : l'opération s'ouvre AVANT la question (garde acquise au lot « Équipes »). */
function onAppliquerRepartition() {
  return avecOperationTerrains(appliquerRepartition_);
}

/** Applique la répartition : écrit le champ « Terrains » de chaque catégorie. */
async function appliquerRepartition_() {
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
  const compositionJson = JSON.stringify(composition);
  // ⭐ Ce qui est DÉJÀ ACQUIS quand une panne survient en cours de SÉRIE (repli seulement) : sans ce
  //   relevé, le message d'échec ne disait rien de ce que le serveur avait pourtant enregistré.
  const acquises = [];
  const avertis = [];      // « modifié entre-temps ailleurs, valeur enregistrée gardée » (fusion)
  /** La demande d'une catégorie : sa ligne chargée, le terrain à écrire, et la `base` de la fusion. */
  const demandeCategorie = function (nom) {
    const catObj = (configCourante.categories || []).find(function (c) { return String(c.categorie) === nom; });
    if (!catObj) return null;
    // ⭐ FUSION À TROIS VOIES (contrat d'écriture, comme la carte « Catégories »).
    //   ⛔ CE QUI N'ALLAIT PAS. L'envoi partait SANS `mode` ni `base` : le serveur réécrivait alors la
    //   ligne ENTIÈRE avec la copie que l'écran avait en mémoire. Un réglage changé entre-temps sur un
    //   autre écran (nombre de poules, temps de jeu, présence…) était donc silencieusement ramené à sa
    //   valeur d'avant. Mesuré : nb_poules 4 → 2 et durée de mi-temps 10 → 8, sans un mot.
    const base = {};
    Object.keys(catObj).forEach(function (c) { base[c] = catObj[c] == null ? '' : String(catObj[c]); });
    return Object.assign({}, catObj, { terrains: par[nom].join(','), mode: 'modifier', base: base });
  };
  /** L'écran suit la ligne RELUE par le serveur, jamais la copie envoyée. */
  const suivreLigne = function (nom, relue) {
    const idx = configCourante.categories.findIndex(function (c) { return String(c.categorie) === nom; });
    if (idx < 0) return;
    const catObj = configCourante.categories[idx];
    configCourante.categories[idx] = relue || Object.assign({}, catObj, { terrains: par[nom].join(',') });
  };
  /** Ce que l'écran fait une fois l'application ACQUISE, quel que soit le chemin. */
  const conclure = async function (texte) {
    configCourante.global = Object.assign({}, configCourante.global,
      { repartition_grands_terrains: compositionJson });
    injecterReglages(configCourante.global, configCourante.categories); // les cartes catégories montrent les nouveaux terrains
    // IMPORTANT : on efface l'état « répartition en attente » AVANT de rafraîchir
    // le fil — sinon le verrou de la barre latérale voit encore « répartition
    // calculée → Appliquer » et l'étape suivante reste fermée jusqu'au clic suivant.
    repartitionCalculee = null;
    document.getElementById('repartition-resultat').innerHTML = '';
    majEtatAvancement(); // le fil ET le verrou suivent immédiatement
    await dialogAlerter(texte +
      (ignorees.length ? '\nLaissées en Manuel : ' + ignorees.join(', ') + '.' : '') +
      (avertis.length ? '\n\n⚠️ ' + avertis.join('\n⚠️ ') : '') +
      '\nIls seront utilisés à la prochaine génération du planning.');
  };

  try {
    /* ------------------------------------------------------------------ ① L'ÉCRITURE GROUPÉE
       UNE requête, UNE exécution serveur, UN verrou, et tout ou rien : le serveur valide les N
       catégories et la composition avant la première écriture, et n'en écrit aucune s'il y a conflit. */
    let groupee = null;
    const demandes = noms.map(demandeCategorie).filter(Boolean);
    try {
      // ⭐ Une fois le refus constaté, on ne redemande plus : le serveur ne changera pas de version en
      //   cours de session. Le second « Appliquer » d'un backend d'avant coûte donc les 4 requêtes
      //   historiques, sans la requête de détection.
      if (backendSansGroupeeConstate) throw refusGroupeeConstate_();
      groupee = await ecrireAdmin('appliquerRepartitionTerrains', {
        categories: JSON.stringify(demandes),
        repartition_grands_terrains: compositionJson
      }, { delaiMs: DELAI_ECRITURE_TERRAINS_MS });
    } catch (erreur) {
      // ⛔ REPLI, et il est EXPLICITE. Un backend d'avant ce lot ne connaît pas l'action : il le DIT
      //   (« Action inconnue »), il ne peut pas ignorer les catégories en silence. Dans ce cas
      //   SEULEMENT, on retombe sur les écritures historiques, une par catégorie puis la composition.
      //   ⛔ Tout autre refus (conflit, demande invalide, verrou occupé, panne) remonte tel quel :
      //   rejouer la série après un vrai refus écrirait ce que le serveur venait d'écarter.
      if (!backendSansEcritureGroupee(erreur)) throw erreur;
      backendSansGroupeeConstate = true;
      groupee = null;
    }

    if (groupee) {
      (groupee.avertissements || []).forEach(function (a) { avertis.push(a.message); });
      (groupee.categories || []).forEach(function (c) { suivreLigne(c.categorie, c.enregistre); });
      if (groupee.config && Array.isArray(groupee.config.categories)) {
        configCourante.categories = groupee.config.categories;
        configCourante.global = Object.assign({}, configCourante.global, groupee.config.global || {});
      }
      const rienAFaire = Array.isArray(groupee.modifies) && groupee.modifies.length === 0;
      await conclure(rienAFaire
        ? '✅ Déjà appliqué : le serveur avait déjà exactement ces terrains (' + noms.join(', ') + '). Rien n’a été réécrit.'
        : '✅ Terrains appliqués aux catégories en mode Auto (' + noms.join(', ') + ').');
      return;
    }

    /* ------------------------------------------------------------------ ② LE REPLI (backend d'avant)
       Le comportement historique, mot pour mot : une écriture par catégorie, puis la composition. */
    for (let k = 0; k < noms.length; k++) {
      const nom = noms[k];
      const data = demandeCategorie(nom);
      if (!data) continue;
      const res = await ecrireAdmin('enregistrerCategorie', data, { delaiMs: DELAI_ECRITURE_TERRAINS_MS });
      acquises.push(nom);
      const enregistre = (res && res.contrat === 'ecriture-v1' && res.enregistre) ? res.enregistre : null;
      suivreLigne(nom, enregistre);
      (((res || {}).avertissements) || []).forEach(function (a) { avertis.push(nom + ' : ' + a.message); });
    }
    // Mémorise la composition des grands terrains (pour le filtre de la page Saisie).
    await ecrireAdmin('enregistrerPlanTerrains', { repartition_grands_terrains: compositionJson },
      { delaiMs: DELAI_ECRITURE_TERRAINS_MS });
    await conclure('✅ Terrains appliqués aux catégories en mode Auto (' + noms.join(', ') + ').');
  } catch (erreur) {
    // ⭐ Une application PARTIELLE rapporte l'état RELU : l'écran s'aligne dessus, sinon sa `base`
    //   serait fausse au rejeu et la fusion à trois voies perdrait sa raison d'être.
    const partielle = (erreur && erreur.reponse) || null;
    if (partielle && partielle.code === 'application_partielle' && partielle.config &&
        Array.isArray(partielle.config.categories)) {
      configCourante.categories = partielle.config.categories;
      configCourante.global = Object.assign({}, configCourante.global, partielle.config.global || {});
    }
    afficherMessage(message, '⚠️ ' + messageEchecApplication(erreur, noms, acquises), 'ko');
    if (bouton) { bouton.disabled = false; bouton.textContent = '✅ Appliquer aux catégories'; }
  }
}

/**
 * Le serveur ne connaît-il PAS l'écriture groupée ? C'est le MARQUEUR DE COMPATIBILITÉ du lot.
 * ⛔ Un backend d'avant refuse EXPLICITEMENT une action qu'il ne connaît pas (`doPost`, branche par
 *   défaut) : il ne peut pas l'accepter en n'écrivant que la moitié. Tout autre message — conflit,
 *   demande invalide, verrou occupé, panne réseau — n'autorise AUCUN repli : rejouer la série
 *   écrirait ce que le serveur venait justement d'écarter.
 */
/* Le serveur a DÉJÀ refusé l'écriture groupée dans cette session : inutile de la redemander. */
let backendSansGroupeeConstate = false;
/** Le refus que l'on se sert à soi-même quand la capacité est déjà connue absente (aucune requête). */
function refusGroupeeConstate_() {
  const e = new Error('Action inconnue : appliquerRepartitionTerrains');
  e.reponse = { error: e.message };
  return e;
}

function backendSansEcritureGroupee(erreur) {
  return !!(erreur && erreur.reponse && /^Action inconnue/.test(String(erreur.message || '')));
}

/**
 * Le message d'un « Appliquer » qui n'a pas abouti. Il distingue quatre issues, parce qu'elles
 * n'appellent pas la même conduite :
 *   · CONFLIT — le serveur a tout écarté : il faut décider, pas réessayer ;
 *   · RÉSULTAT NON CONFIRMÉ (réponse perdue, silence) — l'écriture a pu passer : recliquer est sans danger ;
 *   · APPLICATION PARTIELLE (repli seulement) — on dit ce qui est acquis et ce qui reste ;
 *   · REFUS SERVEUR — rien n'a été écrit, le message du serveur suffit.
 */
function messageEchecApplication(erreur, noms, acquises) {
  const reponse = (erreur && erreur.reponse) || null;
  // ⭐ APPLICATION PARTIELLE ÉTABLIE PAR LE SERVEUR. Il a relu le classeur sous le verrou : il ne
  //   suppose rien, il dit ce qui est écrit et ce qui manque. ⛔ Jamais un succès, même partiel.
  if (reponse && reponse.code === 'application_partielle' && reponse.etabli === false) {
    // ⛔ Le serveur n'a même pas pu relire : on n'invente aucune liste.
    return 'Résultat NON CONFIRMÉ — l’enregistrement a été interrompu et le serveur n’a pas pu relire ' +
      'le classeur.\n➡️ Reclique « Appliquer » : la reprise ne réécrit que ce qui manque, sans écraser ' +
      'ce qui aurait changé entre-temps.';
  }
  if (reponse && reponse.code === 'application_partielle') {
    const faites = (reponse.categories || []).filter(function (c) { return c.appliquee; })
      .map(function (c) { return c.categorie; });
    const reste = (reponse.reste || []).filter(function (n) { return n !== 'composition'; });
    const compositionManque = (reponse.reste || []).indexOf('composition') !== -1;
    const rienEcrit = (reponse.modifies || []).length === 0;
    return (rienEcrit
      ? 'Enregistrement interrompu — le serveur a relu le classeur : AUCUNE modification n’a été enregistrée.'
      : 'Application PARTIELLE — l’enregistrement a été interrompu.') +
      (faites.length ? '\n✅ Déjà enregistrées : ' + faites.join(', ') + '.' : '') +
      (reste.length ? '\n⏳ Restent à appliquer : ' + reste.join(', ') + '.' : '') +
      (compositionManque ? '\n⏳ Reste à mémoriser la composition des grands terrains.' : '') +
      '\n➡️ Reclique « Appliquer » : la reprise ne réécrit pas ce qui est déjà conforme, elle complète ce qui manque.';
  }
  if (reponse && reponse.code === 'modification_concurrente') {
    return erreur.message +
      '\n➡️ Recharge l’écran pour voir les réglages actuels, puis décide — réappliquer écraserait ' +
      'ce qui a été changé entre-temps.';
  }
  const perdue = erreur && !reponse && (erreur.name === 'AbortError' || erreur.name === 'TypeError' ||
    erreur.name === 'SyntaxError' || /erreur \(\d{3}\)/.test(String(erreur.message || '')));
  const partielle = acquises.length
    ? '\n✅ Déjà enregistrées : ' + acquises.join(', ') + '.' +
      (noms.filter(function (n) { return acquises.indexOf(n) === -1; }).length
        ? '\n⏳ Restent à appliquer : ' + noms.filter(function (n) { return acquises.indexOf(n) === -1; }).join(', ') + '.'
        : '\n⏳ Reste à mémoriser la composition des grands terrains.')
    : '';
  if (perdue) {
    const cause = erreur.name === 'AbortError' ? 'aucune réponse du serveur dans le délai'
      : erreur.name === 'TypeError' ? 'connexion interrompue'
      : String(erreur.message || 'réponse illisible').replace(/\.$/, '');
    return 'Application NON CONFIRMÉE (' + cause + ').' + partielle +
      '\n➡️ Reclique « Appliquer » : ce qui est déjà enregistré ne sera pas écrit deux fois.';
  }
  return erreur.message + (partielle ||
    (acquises.length ? '' : '\n⛔ Aucune catégorie n’a été modifiée.'));
}
