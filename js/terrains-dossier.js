/** Plans de terrains du dossier club — géométrie issue uniquement du placement validé. */
(function (racine) {
  'use strict';

  const PALETTE = ['#1779f1', '#f08332', '#16865d', '#7b4ab2', '#087f8c', '#bb3e3e'];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }
  function nombre(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0; }
  function couleur(v, i) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : PALETTE[i % PALETTE.length]; }

  function lirePlanTerrainsDossier(brut) {
    let plan = brut;
    if (typeof brut === 'string') {
      if (!brut.trim()) return null;
      try { plan = JSON.parse(brut); } catch (e) { return null; }
    }
    if (!plan || Number(plan.version) !== 1 || !Array.isArray(plan.fields)) return null;
    const fields = plan.fields.map(function (fp) {
      const f = (fp && fp.field) || {}, L = nombre(f.L), W = nombre(f.W);
      if (!(L > 0) || !(W > 0)) return null;
      const zones = (Array.isArray(fp.zones) ? fp.zones : []).map(function (z, zi) {
        const tiles = (z && Array.isArray(z.tiles) ? z.tiles : []).map(function (t) {
          const x = nombre(t.x), y = nombre(t.y), w = nombre(t.w), h = nombre(t.h);
          if (!(w > 0) || !(h > 0) || x < 0 || y < 0 || x + w > L + .01 || y + h > W + .01) return null;
          return { id: String(t.id || ''), x: x, y: y, w: w, h: h,
            eb: Math.max(0, nombre(t.eb)), ebAxe: String(t.ebAxe || '') };
        }).filter(Boolean);
        return tiles.length ? { cat: String((z && z.cat) || '').trim(), color: couleur(z && z.color, zi), tiles: tiles } : null;
      }).filter(Boolean);
      return { code: String(fp.code || f.code || ''), field: {
        nom: String(f.nom || fp.code || 'Grand terrain'), code: String(f.code || fp.code || ''),
        type: String(f.type || ''), nature: String(f.nature || ''), L: L, W: W,
        x: nombre(f.x), y: nombre(f.y), rot: nombre(f.rot)
      }, zones: zones };
    }).filter(Boolean);
    const optionNombre = function (nom) {
      return Object.prototype.hasOwnProperty.call(plan, nom) ? Math.max(0, nombre(plan[nom])) : null;
    };
    return fields.length ? { version: 1, fields: fields,
      couloir: optionNombre('couloir'), tableL: optionNombre('tableL'), tableW: optionNombre('tableW') } : null;
  }

  function texteCentreSvg_(texte, x, y, taille, classe) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="middle" font-size="'
      + taille + '" class="' + classe + '">' + esc(texte) + '</text>';
  }
  function categories_(fp) {
    const cats = [];
    fp.zones.forEach(function (z) { if (z.cat && !cats.some(function (c) { return c.cat === z.cat; })) cats.push({ cat: z.cat, color: z.color }); });
    return cats;
  }
  function nbMini_(fp) { return fp.zones.reduce(function (s, z) { return s + z.tiles.length; }, 0); }

  /** Plan coté : le viewBox conserve exactement le rapport physique L/W. */
  function planSvg_(fp, index) {
    const f = fp.field, marge = Math.max(7, Math.min(f.L, f.W) * .12);
    const sourceW = f.L + marge * 2, sourceH = f.W + marge * 2;
    const angle = ((nombre(f.rot) % 360) + 360) % 360, radians = angle * Math.PI / 180;
    const vbW = nombre(Math.abs(sourceW * Math.cos(radians)) + Math.abs(sourceH * Math.sin(radians)));
    const vbH = nombre(Math.abs(sourceW * Math.sin(radians)) + Math.abs(sourceH * Math.cos(radians)));
    const motif = 'd-gazon-' + index;
    let svg = '<svg class="d-plan-svg" viewBox="0 0 ' + vbW + ' ' + vbH + '" role="img" '
      + 'aria-labelledby="d-plan-titre-' + index + ' d-plan-desc-' + index + '" preserveAspectRatio="xMidYMid meet">'
      + '<title id="d-plan-titre-' + index + '">' + esc('Plan coté — ' + f.nom) + '</title>'
      + '<desc id="d-plan-desc-' + index + '">' + esc('Grand terrain de ' + f.L + ' par ' + f.W + ' mètres avec '
        + nbMini_(fp) + ' mini-terrain(s) validé(s), orientation ' + angle + ' degrés.') + '</desc>'
      + '<defs><linearGradient id="' + motif + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#79a967"/>'
      + '<stop offset="1" stop-color="#4f874f"/></linearGradient><pattern id="' + motif + '-bandes" width="18" height="18" '
      + 'patternUnits="userSpaceOnUse"><rect width="9" height="18" fill="#fff" opacity=".035"/></pattern></defs>'
      + '<g class="d-plan-orientation" transform="translate(' + nombre(vbW / 2) + ' ' + nombre(vbH / 2) + ') rotate('
      + angle + ') translate(' + nombre(-sourceW / 2) + ' ' + nombre(-sourceH / 2) + ')">'
      + '<rect class="d-plan-fond" x="' + marge + '" y="' + marge + '" width="' + f.L + '" height="' + f.W
      + '" rx="1.4" fill="url(#' + motif + ')"/><rect x="' + marge + '" y="' + marge + '" width="' + f.L
      + '" height="' + f.W + '" fill="url(#' + motif + '-bandes)"/>'
      + '<rect class="d-plan-limite" x="' + (marge + 2) + '" y="' + (marge + 2) + '" width="' + (f.L - 4)
      + '" height="' + (f.W - 4) + '"/><line class="d-plan-ligne" x1="' + (marge + f.L / 2) + '" y1="' + (marge + 2)
      + '" x2="' + (marge + f.L / 2) + '" y2="' + (marge + f.W - 2) + '"/><circle class="d-plan-ligne" cx="'
      + (marge + f.L / 2) + '" cy="' + (marge + f.W / 2) + '" r="' + Math.min(10, f.W * .12) + '"/>'
      + '<line class="d-plan-ligne est-pointillee" x1="' + (marge + f.L * .23) + '" y1="' + (marge + 2) + '" x2="'
      + (marge + f.L * .23) + '" y2="' + (marge + f.W - 2) + '"/><line class="d-plan-ligne est-pointillee" x1="'
      + (marge + f.L * .77) + '" y1="' + (marge + 2) + '" x2="' + (marge + f.L * .77) + '" y2="'
      + (marge + f.W - 2) + '"/>';
    fp.zones.forEach(function (z) { z.tiles.forEach(function (t) {
      const x = marge + t.x, y = marge + t.y;
      svg += '<g class="d-plan-mini"><rect x="' + x + '" y="' + y + '" width="' + t.w + '" height="' + t.h
        + '" rx=".7" fill="' + z.color + '"/><rect class="d-plan-mini-interieur" x="' + (x + 1.2) + '" y="' + (y + 1.2)
        + '" width="' + Math.max(0, t.w - 2.4) + '" height="' + Math.max(0, t.h - 2.4) + '"/>';
      if (t.eb > 0) {
        if (t.ebAxe === 'x') svg += '<line class="d-plan-mini-ligne" x1="' + (x + t.eb) + '" y1="' + y + '" x2="'
          + (x + t.eb) + '" y2="' + (y + t.h) + '"/><line class="d-plan-mini-ligne" x1="' + (x + t.w - t.eb) + '" y1="'
          + y + '" x2="' + (x + t.w - t.eb) + '" y2="' + (y + t.h) + '"/>';
        else svg += '<line class="d-plan-mini-ligne" x1="' + x + '" y1="' + (y + t.eb) + '" x2="' + (x + t.w)
          + '" y2="' + (y + t.eb) + '"/><line class="d-plan-mini-ligne" x1="' + x + '" y1="' + (y + t.h - t.eb)
          + '" x2="' + (x + t.w) + '" y2="' + (y + t.h - t.eb) + '"/>';
      }
      svg += texteCentreSvg_(t.id || z.cat, x + t.w / 2, y + t.h / 2 - 1.8,
        Math.max(2.7, Math.min(5.2, Math.min(t.w, t.h) * .18)), 'd-plan-mini-label')
        + texteCentreSvg_(z.cat + ' · ' + t.w + ' × ' + t.h + ' m', x + t.w / 2, y + t.h / 2 + 2.4,
          Math.max(2.1, Math.min(3.6, Math.min(t.w, t.h) * .12)), 'd-plan-mini-meta') + '</g>';
    }); });
    svg += '<line class="d-plan-cote" x1="' + marge + '" y1="' + (marge - 3) + '" x2="' + (marge + f.L) + '" y2="'
      + (marge - 3) + '"/>' + texteCentreSvg_(f.L + ' m', marge + f.L / 2, marge - 5.2, 3.5, 'd-plan-cote-label')
      + '<line class="d-plan-cote" x1="' + (marge - 3) + '" y1="' + marge + '" x2="' + (marge - 3) + '" y2="'
      + (marge + f.W) + '"/><text x="' + (marge - 5.2) + '" y="' + (marge + f.W / 2) + '" text-anchor="middle" '
      + 'font-size="3.5" class="d-plan-cote-label" transform="rotate(-90 ' + (marge - 5.2) + ' ' + (marge + f.W / 2)
      + ')">' + esc(f.W + ' m') + '</text></g></svg>';
    return svg;
  }

  function coinsTerrain_(f) {
    const a = nombre(f.rot) * Math.PI / 180, cx = f.x + f.L / 2, cy = f.y + f.W / 2;
    return [[f.x, f.y], [f.x + f.L, f.y], [f.x + f.L, f.y + f.W], [f.x, f.y + f.W]].map(function (p) {
      const dx = p[0] - cx, dy = p[1] - cy;
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    });
  }

  function planSiteSvg_(plan) {
    const points = [];
    plan.fields.forEach(function (fp) { coinsTerrain_(fp.field).forEach(function (p) { points.push(p); }); });
    const minX = Math.min.apply(null, points.map(function (p) { return p[0]; }));
    const minY = Math.min.apply(null, points.map(function (p) { return p[1]; }));
    const maxX = Math.max.apply(null, points.map(function (p) { return p[0]; }));
    const maxY = Math.max.apply(null, points.map(function (p) { return p[1]; }));
    const pad = 30, w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    let svg = '<svg class="d-plan-site-svg" viewBox="0 0 ' + (w + pad * 2) + ' ' + (h + pad * 2)
      + '" role="img" aria-labelledby="d-plan-site-titre d-plan-site-desc" preserveAspectRatio="xMidYMid meet">'
      + '<title id="d-plan-site-titre">Vue globale des terrains</title><desc id="d-plan-site-desc">Implantation conforme au placement enregistré. Sélectionnez un grand terrain pour le détailler.</desc>'
      + '<defs><pattern id="d-site-grain" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".65" fill="#496c3d" opacity=".28"/>'
      + '<circle cx="10" cy="8" r=".5" fill="#fff" opacity=".14"/></pattern></defs><rect class="d-plan-site-sol" width="100%" height="100%"/>'
      + '<path class="d-plan-site-allee" d="M ' + (w * .52) + ' -10 L ' + (w * .45) + ' ' + (h + pad * 2 + 10) + '"/>'
      + '<path class="d-plan-site-allee secondaire" d="M -10 ' + (h * .63) + ' L ' + (w + pad * 2 + 10) + ' ' + (h * .84) + '"/>'
      + '<rect width="100%" height="100%" fill="url(#d-site-grain)"/>';
    plan.fields.forEach(function (fp, index) {
      const f = fp.field, tx = pad + f.x - minX, ty = pad + f.y - minY;
      const cats = categories_(fp).map(function (c) { return c.cat; }).join(' · '), nb = nbMini_(fp);
      svg += '<g class="d-plan-site-terrain" role="button" tabindex="0" data-plan-index="' + index + '" aria-label="Ouvrir '
        + esc(f.nom + ', ' + f.L + ' par ' + f.W + ' mètres') + '" transform="translate(' + tx + ' ' + ty + ') rotate('
        + f.rot + ' ' + (f.L / 2) + ' ' + (f.W / 2) + ')"><rect class="d-plan-site-ombre" x="2" y="3" width="'
        + f.L + '" height="' + f.W + '" rx="1.5"/><rect class="d-plan-site-fond" width="' + f.L + '" height="' + f.W
        + '" rx="1.5"/><rect class="d-plan-site-contour" x="3" y="3" width="' + Math.max(0, f.L - 6) + '" height="'
        + Math.max(0, f.W - 6) + '"/><line class="d-plan-site-milieu" x1="' + (f.L / 2) + '" y1="3" x2="' + (f.L / 2)
        + '" y2="' + (f.W - 3) + '"/>' + texteCentreSvg_((f.code ? f.code + ' · ' : '') + f.nom, f.L / 2,
          Math.max(7, f.W * .34), Math.max(4.5, Math.min(8, f.W * .11)), 'd-plan-site-nom')
        + texteCentreSvg_(nb ? nb + ' mini-terrain' + (nb > 1 ? 's' : '') + (cats ? ' · ' + cats : '') : 'Disponible',
          f.L / 2, Math.min(f.W - 6, f.W * .68), Math.max(3.4, Math.min(5.2, f.W * .075)), 'd-plan-site-cats') + '</g>';
    });
    svg += '<g class="d-plan-site-nord"><circle cx="' + (w + pad * 2 - 20) + '" cy="20" r="12"/>'
      + texteCentreSvg_('N ↑', w + pad * 2 - 20, 20, 6, 'd-plan-site-nord-texte') + '</g><g class="d-plan-site-echelle"><line x1="'
      + (w + pad * 2 - 55) + '" y1="' + (h + pad * 2 - 16) + '" x2="' + (w + pad * 2 - 20) + '" y2="'
      + (h + pad * 2 - 16) + '"/>' + texteCentreSvg_('20 m', w + pad * 2 - 37.5, h + pad * 2 - 9, 4.2,
        'd-plan-site-echelle-texte') + '</g></svg>';
    return svg;
  }

  function articlePlan_(fp, index, classe) {
    const f = fp.field, angle = ((nombre(f.rot) % 360) + 360) % 360;
    const meta = [f.type, f.nature, 'Orientation ' + angle + '°'].filter(Boolean), categories = categories_(fp);
    return '<article class="d-plan-terrain' + (classe ? ' ' + classe : '') + '"><header class="d-plan-entete">'
      + '<button type="button" class="d-plan-retour no-print" data-plan-retour>←&nbsp; Vue globale</button>'
      + '<div class="d-plan-identite"><h3 id="d-plan-detail-titre-' + index + '">' + esc((f.code ? f.code + ' · ' : '') + f.nom
        + ' · ' + f.L + ' × ' + f.W + ' m') + '</h3>' + (meta.length ? '<p class="d-plan-meta">' + meta.map(esc).join(' · ') + '</p>' : '') + '</div>'
      + '<div class="d-plan-legende">' + (categories.length ? categories.map(function (c) {
        return '<span><i style="--plan-couleur:' + c.color + '"></i>' + esc(c.cat) + '</span>';
      }).join('') : '<span>Aucun mini-terrain affecté</span>') + '</div></header><div class="d-plan-visuel">'
      + planSvg_(fp, index) + '</div></article>';
  }

  function htmlPlansTerrainsDossier(brut) {
    const plan = lirePlanTerrainsDossier(brut);
    if (!plan) return '';
    return '<div class="d-plans-intro"><p>Vue du site conforme au placement de l’onglet Terrains. Sélectionnez un grand terrain pour voir ses mini-terrains ; les grands plans sont développés dans le PDF.</p></div>'
      + '<div class="d-plan-ecran"><div class="d-plan-vue-globale" data-plan-vue="globale"><div class="d-plan-site">' + planSiteSvg_(plan)
      + '</div><p class="d-plan-indication">Cliquez sur l’empreinte d’un grand terrain pour ouvrir son plan détaillé.</p></div>'
      + '<div class="d-plan-vue-detail" data-plan-vue="detail" hidden></div>'
      + plan.fields.map(function (fp, i) { return '<template data-plan-modele="' + i + '">' + articlePlan_(fp, i, '') + '</template>'; }).join('')
      + '</div><div class="d-plans-impression">' + plan.fields.map(function (fp, i) { return articlePlan_(fp, i, 'd-plan-terrain-impression'); }).join('') + '</div>';
  }

  function brancherPlansTerrainsDossier(conteneur) {
    const rac = conteneur || document, globale = rac.querySelector('[data-plan-vue="globale"]'), detail = rac.querySelector('[data-plan-vue="detail"]');
    if (!globale || !detail) return;
    let dernierBouton = null;
    function retour() { detail.hidden = true; detail.innerHTML = ''; globale.hidden = false; if (dernierBouton) dernierBouton.focus(); }
    rac.querySelectorAll('[data-plan-index]').forEach(function (bouton) {
      function ouvrir() {
        const modele = rac.querySelector('template[data-plan-modele="' + bouton.getAttribute('data-plan-index') + '"]');
        if (!modele) return;
        dernierBouton = bouton; detail.innerHTML = modele.innerHTML; globale.hidden = true; detail.hidden = false;
        const revenir = detail.querySelector('[data-plan-retour]');
        if (revenir) { revenir.addEventListener('click', retour); revenir.focus(); }
      }
      bouton.addEventListener('click', ouvrir);
      bouton.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } });
    });
  }

  racine.lirePlanTerrainsDossier = lirePlanTerrainsDossier;
  racine.htmlPlansTerrainsDossier = htmlPlansTerrainsDossier;
  racine.brancherPlansTerrainsDossier = brancherPlansTerrainsDossier;
  if (typeof module !== 'undefined' && module.exports) module.exports = {
    lirePlanTerrainsDossier: lirePlanTerrainsDossier, htmlPlansTerrainsDossier: htmlPlansTerrainsDossier,
    brancherPlansTerrainsDossier: brancherPlansTerrainsDossier
  };
})(typeof window !== 'undefined' ? window : globalThis);
