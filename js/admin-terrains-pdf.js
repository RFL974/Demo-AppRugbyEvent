/**
 * Sorties bénévoles du plan des terrains.
 *
 * Le PDF est construit dans le navigateur à partir de `repartitionCalculee`, déjà présent en
 * mémoire. Il ne lit ni n'écrit aucune donnée distante. Une sortie n'est possible que pour la
 * géométrie explicitement validée par l'organisateur.
 */

let cachePdfTerrains = {};
let urlApercuPdfTerrains = '';

function nombrePackTerrains_(valeur) {
  const n = Number(valeur);
  return isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

/** Empreinte déterministe des seules données qui influencent le plan imprimé. */
function empreintePackTerrains(plan) {
  if (!plan) return '';
  return JSON.stringify({
    fieldsPlan: (plan.fieldsPlan || []).map(function (fp) {
      const f = fp.field || {};
      return {
        code: String(fp.code || f.code || ''), mode: String(fp.mode || ''),
        field: {
          nom: String(f.nom || ''), code: String(f.code || ''), type: String(f.type || ''),
          nature: String(f.nature || ''), L: nombrePackTerrains_(f.L), W: nombrePackTerrains_(f.W),
          x: nombrePackTerrains_(f.x), y: nombrePackTerrains_(f.y), rot: nombrePackTerrains_(f.rot)
        },
        zones: (fp.zones || []).map(function (z) {
          return {
            cat: String(z.cat || ''),
            tiles: (z.tiles || []).map(function (t) {
              return {
                id: String(t.id || ''), label: String(t.label || ''), x: nombrePackTerrains_(t.x),
                y: nombrePackTerrains_(t.y), w: nombrePackTerrains_(t.w), h: nombrePackTerrains_(t.h),
                eb: nombrePackTerrains_(t.eb), ebAxe: String(t.ebAxe || '')
              };
            })
          };
        }),
        table: fp.table ? {
          x: nombrePackTerrains_(fp.table.x), y: nombrePackTerrains_(fp.table.y),
          w: nombrePackTerrains_(fp.table.w), h: nombrePackTerrains_(fp.table.h)
        } : null
      };
    }),
    misDeCote: (plan.misDeCote || []).map(function (c) {
      return { cat: String(c.cat || ''), plein: !!c.plein, pivote: !!c.pivote };
    }),
    couloir: nombrePackTerrains_((plan.ctxManuel || {}).m),
    tableL: nombrePackTerrains_((plan.ctxManuel || {}).tmL),
    tableW: nombrePackTerrains_((plan.ctxManuel || {}).tmW),
    tablesPosees: !!plan.tablesPosees
  });
}

/**
 * Copie minimale du plan validé destinée au dossier du club.
 *
 * Le PDF bénévoles travaille avec un objet riche et mutable (poignées de déplacement, mémoire
 * d'annulation, éléments laissés de côté…). Le dossier n'a besoin que de la géométrie effectivement
 * posée. Cette projection évite donc de publier l'état de l'éditeur tout en conservant exactement
 * les grands visuels cotés : dimensions, mini-terrains, en-buts et table de marque.
 */
function planTerrainsPourDossier(plan) {
  if (!plan) return null;
  const nombre = function (v) { return nombrePackTerrains_(v); };
  const fields = (plan.fieldsPlan || []).map(function (fp) {
    const f = fp.field || {};
    const zones = (fp.zones || []).map(function (z) {
      return {
        cat: String(z.cat || ''),
        color: String(z.color || ''),
        tiles: (z.tiles || []).map(function (t) {
          return {
            id: String(t.id || t.label || ''), x: nombre(t.x), y: nombre(t.y),
            w: nombre(t.w), h: nombre(t.h), eb: nombre(t.eb), ebAxe: String(t.ebAxe || '')
          };
        }).filter(function (t) { return t.w > 0 && t.h > 0; })
      };
    }).filter(function (z) { return z.tiles.length > 0; });
    // Un grand terrain configuré reste utile dans la vue d'implantation même s'il n'a encore
    // aucun mini-terrain. Le masquer déformerait le site réel présenté au club.
    if (!(nombre(f.L) > 0) || !(nombre(f.W) > 0)) return null;
    return {
      code: String(fp.code || f.code || ''),
      field: {
        nom: String(f.nom || fp.code || ''), code: String(f.code || fp.code || ''),
        type: String(f.type || ''), nature: String(f.nature || ''), L: nombre(f.L), W: nombre(f.W),
        x: nombre(f.x), y: nombre(f.y), rot: nombre(f.rot)
      },
      zones: zones
    };
  }).filter(Boolean);
  if (!fields.length) return null;
  return {
    version: 1,
    fields: fields,
    couloir: nombre((plan.ctxManuel || {}).m),
    tableL: nombre((plan.ctxManuel || {}).tmL),
    tableW: nombre((plan.ctxManuel || {}).tmW)
  };
}

function echapperPackTerrains_(valeur) {
  if (typeof echapper === 'function') return echapper(String(valeur == null ? '' : valeur));
  return String(valeur == null ? '' : valeur).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function planTerrainsValide_(plan, empreinteValidee) {
  return !!(plan && plan.tablesPosees && empreinteValidee &&
    empreinteValidee === empreintePackTerrains(plan));
}

/** Bloc inséré sous le plan : aucun travail PDF n'est fait tant que l'utilisateur ne le demande. */
function htmlSortiesTerrains(plan, empreinteValidee) {
  const valide = planTerrainsValide_(plan, empreinteValidee);
  const options = (plan.fieldsPlan || []).map(function (fp, i) {
    const nom = (fp.field || {}).nom || fp.code || ('Terrain ' + (i + 1));
    return '<option value="' + i + '">' + echapperPackTerrains_(nom) + '</option>';
  }).join('');
  const desactive = valide ? '' : ' disabled';
  return '<section class="terrains-sorties" id="terrains-sorties" aria-labelledby="terrains-sorties-titre">' +
    '<div class="terrains-sorties-entete"><div><p class="terrains-sorties-surtitre">Pour les bénévoles</p>' +
    '<h4 id="terrains-sorties-titre">Plans cotés et affiches A4</h4></div>' +
    '<span class="terrains-sorties-etat ' + (valide ? 'est-pret' : '') + '" id="terrains-sorties-etat">' +
    (valide ? 'Plan validé · prêt à produire' : 'Valide le placement pour produire les documents') + '</span></div>' +
    '<p class="terrains-sorties-intro">Le document reprend exactement le plan affiché : dimensions ' +
    'des grands terrains, mini-terrains, en-buts et couloirs. Sa création reste locale et ne ' +
    'déclenche aucun appel serveur.</p>' +
    '<div class="terrains-sorties-reglages">' +
    '<label>Contenu<select class="r-input" id="terrains-pdf-contenu"' + desactive + '>' +
    '<option value="complet">Pack complet</option><option value="plans">Plans cotés uniquement</option>' +
    '<option value="affiches">Affiches A4 uniquement</option></select></label>' +
    '<label>Terrain<select class="r-input" id="terrains-pdf-terrain"' + desactive + '>' +
    '<option value="tous">Tous les grands terrains</option>' + options + '</select></label></div>' +
    '<div class="terrains-sorties-actions">' +
    '<button type="button" class="bouton secondaire" id="bouton-apercu-pdf-terrains"' + desactive + '>Aperçu</button>' +
    '<button type="button" class="bouton" id="bouton-telecharger-pdf-terrains"' + desactive + '>Télécharger le PDF</button>' +
    '<button type="button" class="bouton secondaire" id="bouton-partager-pdf-terrains"' + desactive + '>Partager</button>' +
    '<span class="message-form" id="message-pdf-terrains" role="status" aria-live="polite"></span></div>' +
    '<dialog class="terrains-pdf-dialogue" id="dialogue-apercu-pdf-terrains" aria-labelledby="titre-apercu-pdf-terrains">' +
    '<div class="terrains-pdf-dialogue-entete"><h4 id="titre-apercu-pdf-terrains">Aperçu du pack bénévoles</h4>' +
    '<button type="button" class="bouton-icone" id="fermer-apercu-pdf-terrains" aria-label="Fermer l’aperçu">×</button></div>' +
    '<iframe id="cadre-apercu-pdf-terrains" title="Aperçu du PDF des terrains"></iframe></dialog></section>';
}

function invaliderPackTerrains() {
  if (typeof empreintePlacementTerrainsValide !== 'undefined') empreintePlacementTerrainsValide = '';
  cachePdfTerrains = {};
  const bloc = typeof document !== 'undefined' && document.getElementById('terrains-sorties');
  if (!bloc) return;
  bloc.querySelectorAll('button, select').forEach(function (el) { el.disabled = true; });
  const etat = document.getElementById('terrains-sorties-etat');
  if (etat) {
    etat.classList.remove('est-pret');
    etat.textContent = 'Plan modifié · valide à nouveau le placement';
  }
}

function textePdfTerrains_(valeur) {
  return String(valeur == null ? '' : valeur)
    .replace(/[–—]/g, '-').replace(/’/g, "'").replace(/→/g, '>').replace(/…/g, '...')
    .replace(/[^ -~ -ÿ]/g, '');
}

function couperTextePdfTerrains_(texte, font, taille, largeur) {
  const mots = textePdfTerrains_(texte).split(/\s+/).filter(Boolean);
  const lignes = [];
  let ligne = '';
  mots.forEach(function (mot) {
    const essai = ligne ? ligne + ' ' + mot : mot;
    if (ligne && font.widthOfTextAtSize(essai, taille) > largeur) {
      lignes.push(ligne); ligne = mot;
    } else ligne = essai;
  });
  if (ligne) lignes.push(ligne);
  return lignes;
}

function dessinerTexteCoupe_(page, texte, options) {
  const lignes = couperTextePdfTerrains_(texte, options.font, options.size, options.maxWidth);
  lignes.slice(0, options.maxLines || lignes.length).forEach(function (ligne, i) {
    page.drawText(ligne, {
      x: options.x, y: options.y - i * (options.lineHeight || options.size * 1.25),
      size: options.size, font: options.font, color: options.color
    });
  });
  return lignes.length;
}

function couleurPdfTerrains_(PDFLib, valeur, repli) {
  const m = String(valeur || '').match(/^#([0-9a-f]{6})$/i);
  if (!m) return repli;
  const n = parseInt(m[1], 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function metadonneesPackTerrains_() {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  return {
    nom: String(g.tournoi_nom || 'Tournoi'), date: String(g.tournoi_date || ''),
    lieu: String(g.tournoi_lieu || ''), afficheId: String(g.tournoi_affiche_id || ''),
    couleurs: (typeof repartitionCalculee !== 'undefined' && repartitionCalculee && repartitionCalculee.couleur) || {}
  };
}

function dataUriEnOctets_(uri) {
  const m = String(uri || '').match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
  if (!m || typeof atob !== 'function') return null;
  const brut = atob(m[2]);
  const bytes = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) bytes[i] = brut.charCodeAt(i);
  return { mime: m[1].toLowerCase(), bytes: bytes };
}

/** Réutilise l'affiche déjà en mémoire ou déjà décodée par la page ; jamais de téléchargement. */
function afficheLocalePackTerrains_() {
  if (typeof afficheDataURI !== 'undefined' && afficheDataURI) return dataUriEnOctets_(afficheDataURI);
  if (typeof document === 'undefined') return null;
  const img = document.getElementById('apercu-affiche-img');
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  try {
    const canvas = document.createElement('canvas');
    const rapport = Math.min(1, 1400 / img.naturalWidth);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * rapport));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * rapport));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return dataUriEnOctets_(canvas.toDataURL('image/jpeg', 0.86));
  } catch (e) { return null; }
}

function dessinerEntetePdfTerrains_(page, fonts, meta, lib, largeur) {
  const marine = lib.rgb(0.04, 0.12, 0.22);
  page.drawText(textePdfTerrains_(meta.nom || 'Tournoi'), {
    x: 36, y: page.getHeight() - 34, size: 16, font: fonts.bold, color: marine
  });
  const ligne = [meta.date, meta.lieu].filter(Boolean).join(' - ');
  if (ligne) page.drawText(textePdfTerrains_(ligne), {
    x: 36, y: page.getHeight() - 51, size: 9, font: fonts.normal, color: lib.rgb(0.28, 0.35, 0.43)
  });
  page.drawLine({ start: { x: 36, y: page.getHeight() - 61 }, end: { x: largeur - 36, y: page.getHeight() - 61 },
    thickness: 1, color: lib.rgb(0.78, 0.83, 0.88) });
}

function dessinerCouverturePackTerrains_(doc, fonts, meta, fields, lib) {
  const page = doc.addPage([595.28, 841.89]);
  const marine = lib.rgb(0.04, 0.12, 0.22), bleu = lib.rgb(0.10, 0.45, 0.74);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: lib.rgb(0.96, 0.98, 1) });
  page.drawRectangle({ x: 0, y: 620, width: 595.28, height: 221.89, color: marine });
  page.drawText('PACK BENEVOLES', { x: 48, y: 768, size: 13, font: fonts.bold, color: lib.rgb(0.45, 0.78, 1) });
  page.drawText('Préparer les terrains', { x: 48, y: 706, size: 32, font: fonts.bold, color: lib.rgb(1, 1, 1) });
  dessinerTexteCoupe_(page, meta.nom || 'Tournoi', { x: 48, y: 662, size: 18, lineHeight: 23,
    maxWidth: 490, maxLines: 2, font: fonts.normal, color: lib.rgb(0.9, 0.94, 0.98) });
  let y = 548;
  [['DATE', meta.date || 'A compléter'], ['LIEU', meta.lieu || 'A compléter'],
    ['GRANDS TERRAINS', String(fields.length)]].forEach(function (item) {
    page.drawText(item[0], { x: 52, y: y, size: 9, font: fonts.bold, color: bleu });
    page.drawText(textePdfTerrains_(item[1]), { x: 52, y: y - 25, size: 18, font: fonts.bold, color: marine });
    y -= 82;
  });
  page.drawRectangle({ x: 48, y: 130, width: 499, height: 100, color: lib.rgb(1, 1, 1),
    borderColor: lib.rgb(0.78, 0.83, 0.88), borderWidth: 1 });
  dessinerTexteCoupe_(page, 'Ce pack contient les plans cotés de chaque grand terrain, puis les affiches A4 à poser pour les identifier immédiatement.',
    { x: 68, y: 200, size: 13, lineHeight: 19, maxWidth: 455, maxLines: 4,
      font: fonts.normal, color: marine });
  page.drawText('Généré depuis le plan validé - aucune cote n\'est extrapolée.', {
    x: 48, y: 72, size: 9, font: fonts.normal, color: lib.rgb(0.35, 0.42, 0.49)
  });
}

function dessinerMiniTerrainPdf_(page, tuile, zone, cadre, echelle, fonts, couleurs, lib) {
  const x = cadre.x + tuile.x * echelle;
  const y = cadre.y + (cadre.hM - tuile.y - tuile.h) * echelle;
  const w = tuile.w * echelle, h = tuile.h * echelle;
  const fond = couleurPdfTerrains_(lib, couleurs[zone.cat], lib.rgb(0.16, 0.55, 0.76));
  page.drawRectangle({ x: x, y: y, width: w, height: h, color: fond,
    borderColor: lib.rgb(1, 1, 1), borderWidth: 1.1, opacity: 0.94 });
  const eb = Number(tuile.eb) || 0;
  if (eb > 0) {
    if (tuile.ebAxe === 'x') {
      [x, x + w - eb * echelle].forEach(function (bx) {
        page.drawRectangle({ x: bx, y: y, width: eb * echelle, height: h,
          color: lib.rgb(1, 1, 1), opacity: 0.24 });
      });
    } else {
      [y, y + h - eb * echelle].forEach(function (by) {
        page.drawRectangle({ x: x, y: by, width: w, height: eb * echelle,
          color: lib.rgb(1, 1, 1), opacity: 0.24 });
      });
    }
  }
  const nom = textePdfTerrains_(tuile.id || tuile.label || zone.cat || '');
  let taille = Math.min(11, Math.max(6, Math.min(w / Math.max(1, nom.length * 0.55), h / 3)));
  const largeur = fonts.bold.widthOfTextAtSize(nom, taille);
  if (largeur < w - 3 && h > taille + 2) page.drawText(nom, {
    x: x + (w - largeur) / 2, y: y + h / 2 - taille * 0.35, size: taille,
    font: fonts.bold, color: lib.rgb(1, 1, 1)
  });
}

function dessinerPlanCotePackTerrains_(doc, fonts, meta, fp, plan, lib) {
  const page = doc.addPage([841.89, 595.28]);
  const largeur = page.getWidth(), hauteur = page.getHeight();
  dessinerEntetePdfTerrains_(page, fonts, meta, lib, largeur);
  const f = fp.field || {};
  page.drawText(textePdfTerrains_(f.nom || fp.code || 'Grand terrain'), {
    x: 36, y: hauteur - 92, size: 22, font: fonts.bold, color: lib.rgb(0.04, 0.12, 0.22)
  });
  page.drawText(textePdfTerrains_((fp.code || f.code || '') + ' - ' + nombrePackTerrains_(f.L) + ' x ' +
    nombrePackTerrains_(f.W) + ' m'), { x: 36, y: hauteur - 113, size: 11, font: fonts.normal,
    color: lib.rgb(0.31, 0.39, 0.47) });

  const zone = { x: 36, y: 68, w: 594, h: 382 };
  const echelle = Math.min(zone.w / Math.max(1, Number(f.L)), zone.h / Math.max(1, Number(f.W)));
  const fw = Number(f.L) * echelle, fh = Number(f.W) * echelle;
  const cadre = { x: zone.x + (zone.w - fw) / 2, y: zone.y + (zone.h - fh) / 2,
    w: fw, h: fh, hM: Number(f.W) };
  page.drawRectangle({ x: cadre.x, y: cadre.y, width: fw, height: fh,
    color: lib.rgb(0.20, 0.49, 0.28), borderColor: lib.rgb(0.04, 0.12, 0.22), borderWidth: 1.4 });
  (fp.zones || []).forEach(function (z) {
    (z.tiles || []).forEach(function (t) {
      dessinerMiniTerrainPdf_(page, t, z, cadre, echelle, fonts, meta.couleurs || {}, lib);
    });
  });
  if (fp.table) {
    const t = fp.table;
    const x = cadre.x + t.x * echelle, y = cadre.y + (cadre.hM - t.y - t.h) * echelle;
    page.drawRectangle({ x: x, y: y, width: t.w * echelle, height: t.h * echelle,
      color: lib.rgb(0.10, 0.13, 0.17), borderColor: lib.rgb(1, 1, 1), borderWidth: 1 });
    page.drawText('TM', { x: x + 2, y: y + 2, size: Math.min(8, t.h * echelle - 2),
      font: fonts.bold, color: lib.rgb(1, 1, 1) });
  }
  page.drawLine({ start: { x: cadre.x, y: cadre.y - 15 }, end: { x: cadre.x + fw, y: cadre.y - 15 },
    thickness: 0.8, color: lib.rgb(0.12, 0.18, 0.23) });
  page.drawText(nombrePackTerrains_(f.L) + ' m', { x: cadre.x + fw / 2 - 12, y: cadre.y - 28,
    size: 9, font: fonts.bold, color: lib.rgb(0.12, 0.18, 0.23) });
  page.drawLine({ start: { x: cadre.x - 15, y: cadre.y }, end: { x: cadre.x - 15, y: cadre.y + fh },
    thickness: 0.8, color: lib.rgb(0.12, 0.18, 0.23) });
  page.drawText(nombrePackTerrains_(f.W) + ' m', { x: cadre.x - 31, y: cadre.y + fh / 2,
    size: 9, rotate: lib.degrees(90), font: fonts.bold, color: lib.rgb(0.12, 0.18, 0.23) });

  const panneauX = 660;
  page.drawRectangle({ x: panneauX, y: 68, width: 146, height: 382, color: lib.rgb(0.96, 0.98, 1),
    borderColor: lib.rgb(0.78, 0.83, 0.88), borderWidth: 1 });
  let y = 423;
  const ligneInfo = function (titre, valeur) {
    page.drawText(textePdfTerrains_(titre.toUpperCase()), { x: panneauX + 14, y: y, size: 7,
      font: fonts.bold, color: lib.rgb(0.10, 0.45, 0.74) });
    y -= 15;
    dessinerTexteCoupe_(page, valeur, { x: panneauX + 14, y: y, size: 10, lineHeight: 13,
      maxWidth: 118, maxLines: 3, font: fonts.bold, color: lib.rgb(0.04, 0.12, 0.22) });
    y -= 37;
  };
  ligneInfo('Surface', f.nature || f.type || 'Non précisée');
  ligneInfo('Couloir', nombrePackTerrains_((plan.ctxManuel || {}).m) + ' m entre mini-terrains');
  ligneInfo('Orientation', nombrePackTerrains_(f.rot) + ' degrés sur le plan du site');
  const toutes = [];
  (fp.zones || []).forEach(function (z) { (z.tiles || []).forEach(function (t) { toutes.push({ z: z, t: t }); }); });
  ligneInfo('Mini-terrains', String(toutes.length));
  const details = toutes.map(function (o) {
    const eb = Number(o.t.eb) || 0;
    return (o.t.id || o.z.cat) + ' : ' + nombrePackTerrains_(o.t.w) + ' x ' + nombrePackTerrains_(o.t.h) +
      ' m' + (eb ? ', en-but ' + nombrePackTerrains_(eb) + ' m' : '');
  });
  page.drawText('COTES', { x: panneauX + 14, y: y, size: 7, font: fonts.bold,
    color: lib.rgb(0.10, 0.45, 0.74) });
  y -= 15;
  details.slice(0, 11).forEach(function (detail) {
    dessinerTexteCoupe_(page, detail, { x: panneauX + 14, y: y, size: 7.5, lineHeight: 9,
      maxWidth: 118, maxLines: 2, font: fonts.normal, color: lib.rgb(0.10, 0.15, 0.20) });
    y -= 19;
  });
  page.drawText('Cotes en mètres - vérifier les repères fixes du site avant traçage.', {
    x: 36, y: 35, size: 8, font: fonts.normal, color: lib.rgb(0.36, 0.42, 0.48)
  });
}

async function integrerAffichePackTerrains_(doc, poster) {
  if (!poster) return null;
  try {
    return poster.mime === 'image/png' ? await doc.embedPng(poster.bytes) : await doc.embedJpg(poster.bytes);
  } catch (e) { return null; }
}

function dessinerAfficheTerrainPack_(doc, fonts, meta, fp, imageAffiche, lib) {
  const page = doc.addPage([595.28, 841.89]);
  const marine = lib.rgb(0.04, 0.12, 0.22), bleu = lib.rgb(0.10, 0.45, 0.74);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: lib.rgb(1, 1, 1) });
  const zoneAffiche = { x: 38, y: 310, w: 519, h: 486 };
  if (imageAffiche) {
    const s = imageAffiche.scale(1);
    const ratio = Math.min(zoneAffiche.w / s.width, zoneAffiche.h / s.height);
    const w = s.width * ratio, h = s.height * ratio;
    page.drawImage(imageAffiche, { x: zoneAffiche.x + (zoneAffiche.w - w) / 2,
      y: zoneAffiche.y + (zoneAffiche.h - h) / 2, width: w, height: h });
  } else {
    page.drawRectangle({ x: zoneAffiche.x, y: zoneAffiche.y, width: zoneAffiche.w,
      height: zoneAffiche.h, color: lib.rgb(0.94, 0.97, 1) });
    page.drawRectangle({ x: zoneAffiche.x, y: zoneAffiche.y + zoneAffiche.h - 110,
      width: zoneAffiche.w, height: 110, color: marine });
    page.drawText('TOURNOI', { x: 65, y: 746, size: 14, font: fonts.bold, color: lib.rgb(0.45, 0.78, 1) });
    dessinerTexteCoupe_(page, meta.nom || 'Tournoi', { x: 65, y: 708, size: 25, lineHeight: 30,
      maxWidth: 465, maxLines: 2, font: fonts.bold, color: lib.rgb(1, 1, 1) });
    page.drawText(textePdfTerrains_(meta.date || ''), { x: 65, y: 570, size: 24,
      font: fonts.bold, color: marine });
    dessinerTexteCoupe_(page, meta.lieu || '', { x: 65, y: 525, size: 17, lineHeight: 22,
      maxWidth: 465, maxLines: 3, font: fonts.normal, color: lib.rgb(0.25, 0.32, 0.39) });
    page.drawText('Affiche du tournoi indisponible hors ligne : repère composé avec les informations enregistrées.',
      { x: 65, y: 337, size: 8, font: fonts.normal, color: lib.rgb(0.42, 0.48, 0.54) });
  }
  page.drawRectangle({ x: 38, y: 58, width: 519, height: 216, color: marine });
  page.drawText('VOUS ETES SUR LE', { x: 62, y: 228, size: 13, font: fonts.bold,
    color: lib.rgb(0.50, 0.80, 1) });
  const nom = textePdfTerrains_((fp.field || {}).nom || fp.code || 'GRAND TERRAIN');
  let taille = 47;
  while (taille > 25 && fonts.bold.widthOfTextAtSize(nom, taille) > 471) taille -= 1;
  page.drawText(nom, { x: 62, y: 157, size: taille, font: fonts.bold, color: lib.rgb(1, 1, 1) });
  const code = textePdfTerrains_(fp.code || (fp.field || {}).code || '');
  if (code) {
    page.drawRectangle({ x: 62, y: 88, width: 112, height: 38, color: bleu });
    page.drawText(code, { x: 76, y: 99, size: 16, font: fonts.bold, color: lib.rgb(1, 1, 1) });
  }
}

/** Générateur pur : utile au navigateur comme aux sondes locales. */
async function genererPackTerrainsPdf(plan, options) {
  options = options || {};
  const lib = options.PDFLib || (typeof PDFLib !== 'undefined' ? PDFLib : null);
  if (!lib) throw new Error('Bibliothèque PDF non chargée.');
  const doc = await lib.PDFDocument.create();
  const fonts = {
    normal: await doc.embedFont(lib.StandardFonts.Helvetica),
    bold: await doc.embedFont(lib.StandardFonts.HelveticaBold)
  };
  const meta = options.meta || metadonneesPackTerrains_();
  const contenu = options.contenu || 'complet';
  const index = options.terrain === 'tous' || options.terrain == null ? null : Number(options.terrain);
  const fields = (plan.fieldsPlan || []).filter(function (fp, i) { return index == null || i === index; });
  if (!fields.length) throw new Error('Aucun grand terrain à produire.');
  doc.setTitle(textePdfTerrains_('Pack bénévoles - ' + (meta.nom || 'Tournoi')));
  doc.setCreator('Demo Racing - génération locale');
  if (contenu === 'complet') dessinerCouverturePackTerrains_(doc, fonts, meta, fields, lib);
  if (contenu === 'complet' || contenu === 'plans') {
    fields.forEach(function (fp) { dessinerPlanCotePackTerrains_(doc, fonts, meta, fp, plan, lib); });
  }
  if (contenu === 'complet' || contenu === 'affiches') {
    const image = await integrerAffichePackTerrains_(doc, options.poster || null);
    fields.forEach(function (fp) { dessinerAfficheTerrainPack_(doc, fonts, meta, fp, image, lib); });
  }
  return doc.save({ useObjectStreams: false });
}

function choixPackTerrains_() {
  const contenu = document.getElementById('terrains-pdf-contenu');
  const terrain = document.getElementById('terrains-pdf-terrain');
  return { contenu: contenu ? contenu.value : 'complet', terrain: terrain ? terrain.value : 'tous' };
}

function nomFichierPackTerrains_(choix, meta) {
  const base = ('pack-terrains-' + (meta.nom || 'tournoi')).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base + (choix.terrain === 'tous' ? '' : '-terrain-' + (Number(choix.terrain) + 1)) + '.pdf';
}

async function obtenirPdfTerrains_() {
  if (typeof repartitionCalculee === 'undefined' || !planTerrainsValide_(repartitionCalculee,
    typeof empreintePlacementTerrainsValide === 'undefined' ? '' : empreintePlacementTerrainsValide)) {
    throw new Error('Le plan a changé : valide à nouveau le placement.');
  }
  const choix = choixPackTerrains_();
  const meta = metadonneesPackTerrains_();
  const poster = afficheLocalePackTerrains_();
  const cle = empreintePackTerrains(repartitionCalculee) + '|' + choix.contenu + '|' + choix.terrain + '|' +
    meta.nom + '|' + meta.date + '|' + meta.lieu + '|' + meta.afficheId + '|' + (poster ? poster.bytes.length : 0);
  if (!cachePdfTerrains[cle]) cachePdfTerrains[cle] = await genererPackTerrainsPdf(repartitionCalculee, {
    contenu: choix.contenu, terrain: choix.terrain, meta: meta, poster: poster
  });
  return { bytes: cachePdfTerrains[cle], nom: nomFichierPackTerrains_(choix, meta) };
}

function blobPdfTerrains_(bytes) { return new Blob([bytes], { type: 'application/pdf' }); }

function telechargerPdfTerrains_(bytes, nom) {
  const url = URL.createObjectURL(blobPdfTerrains_(bytes));
  const lien = document.createElement('a');
  lien.href = url; lien.download = nom; document.body.appendChild(lien); lien.click(); lien.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

function messagePdfTerrains_(texte, classe) {
  const cible = document.getElementById('message-pdf-terrains');
  if (typeof afficherMessage === 'function' && cible) afficherMessage(cible, texte, classe || 'ok');
  else if (cible) cible.textContent = texte;
}

async function avecActionPdfTerrains_(bouton, action) {
  if (!bouton || bouton.disabled) return;
  const texte = bouton.textContent;
  bouton.disabled = true; bouton.textContent = 'Préparation…';
  try { await action(); }
  catch (e) { messagePdfTerrains_('⚠️ ' + (e && e.message ? e.message : e), 'ko'); }
  finally { bouton.disabled = false; bouton.textContent = texte; }
}

async function onApercuPdfTerrains_(bouton) {
  await avecActionPdfTerrains_(bouton, async function () {
    const pdf = await obtenirPdfTerrains_();
    if (urlApercuPdfTerrains) URL.revokeObjectURL(urlApercuPdfTerrains);
    urlApercuPdfTerrains = URL.createObjectURL(blobPdfTerrains_(pdf.bytes));
    const cadre = document.getElementById('cadre-apercu-pdf-terrains');
    const dialogue = document.getElementById('dialogue-apercu-pdf-terrains');
    if (cadre) cadre.src = urlApercuPdfTerrains + '#view=FitH';
    if (dialogue && dialogue.showModal) dialogue.showModal();
    messagePdfTerrains_('Aperçu produit localement, sans appel serveur.', 'ok');
  });
}

async function onTelechargerPdfTerrains_(bouton) {
  await avecActionPdfTerrains_(bouton, async function () {
    const pdf = await obtenirPdfTerrains_();
    telechargerPdfTerrains_(pdf.bytes, pdf.nom);
    messagePdfTerrains_('✅ PDF téléchargé.', 'ok');
  });
}

async function onPartagerPdfTerrains_(bouton) {
  await avecActionPdfTerrains_(bouton, async function () {
    const pdf = await obtenirPdfTerrains_();
    const fichier = typeof File !== 'undefined' ? new File([pdf.bytes], pdf.nom, { type: 'application/pdf' }) : null;
    if (fichier && navigator.share && (!navigator.canShare || navigator.canShare({ files: [fichier] }))) {
      await navigator.share({ files: [fichier], title: 'Plans des terrains',
        text: 'Plans cotés et affiches des terrains pour les bénévoles.' });
      messagePdfTerrains_('✅ Feuille de partage ouverte.', 'ok');
      return;
    }
    telechargerPdfTerrains_(pdf.bytes, pdf.nom);
    messagePdfTerrains_('Le partage de fichiers n’est pas disponible ici : le PDF a été téléchargé.', 'ok');
  });
}

/** Les écouteurs sont reposés avec le bloc, lui-même réécrit à chaque rendu du plan. */
function brancherSortiesTerrains() {
  const apercu = document.getElementById('bouton-apercu-pdf-terrains');
  const telecharger = document.getElementById('bouton-telecharger-pdf-terrains');
  const partager = document.getElementById('bouton-partager-pdf-terrains');
  const fermer = document.getElementById('fermer-apercu-pdf-terrains');
  const dialogue = document.getElementById('dialogue-apercu-pdf-terrains');
  if (apercu) apercu.addEventListener('click', function () { onApercuPdfTerrains_(apercu); });
  if (telecharger) telecharger.addEventListener('click', function () { onTelechargerPdfTerrains_(telecharger); });
  if (partager) partager.addEventListener('click', function () { onPartagerPdfTerrains_(partager); });
  if (fermer && dialogue) fermer.addEventListener('click', function () { dialogue.close(); });
  if (dialogue) dialogue.addEventListener('close', function () {
    const cadre = document.getElementById('cadre-apercu-pdf-terrains');
    if (cadre) cadre.removeAttribute('src');
    if (urlApercuPdfTerrains) { URL.revokeObjectURL(urlApercuPdfTerrains); urlApercuPdfTerrains = ''; }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    empreintePackTerrains: empreintePackTerrains,
    planTerrainsValide: planTerrainsValide_,
    htmlSortiesTerrains: htmlSortiesTerrains,
    genererPackTerrainsPdf: genererPackTerrainsPdf,
    planTerrainsPourDossier: planTerrainsPourDossier,
    dataUriEnOctets: dataUriEnOctets_
  };
}
