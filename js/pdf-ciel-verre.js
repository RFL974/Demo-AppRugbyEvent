/**
 * Signature PDF locale Ciel & Verre.
 *
 * Ce module ne lit ni le réseau ni le DOM : il fournit seulement des primitives de composition
 * à pdf-lib pour que les dossiers générés dans le navigateur partagent la même identité.
 */
(function (racine) {
  'use strict';

  var HEX = {
    nuit: '#102A43', action: '#155B91', ciel: '#B8D8F8', cyan: '#68D9FF',
    fond: '#F4F7FA', surface: '#FFFFFF', texte: '#102A43', secondaire: '#526477',
    bordure: '#DBE5EE', selection: '#EAF3FB', succes: '#16704A', attention: '#8A5400',
    danger: '#B42318'
  };

  function couleur(PDFLib, hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function texte(valeur) {
    return String(valeur == null ? '' : valeur)
      .replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"').replace(/\u2022/g, '-').replace(/\u2026/g, '...')
      .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\r\n]/g, '');
  }

  async function creer(pdf, PDFLib) {
    var regular = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    var bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var c = {};
    Object.keys(HEX).forEach(function (nom) { c[nom] = couleur(PDFLib, HEX[nom]); });
    var largeur = 595.28, hauteur = 841.89;

    function lignes(valeur, police, taille, maxLargeur) {
      var paragraphes = texte(valeur).split(/\r?\n/), resultat = [];
      paragraphes.forEach(function (paragraphe) {
        var mots = paragraphe.split(/\s+/).filter(Boolean), ligne = '';
        if (!mots.length) { resultat.push(''); return; }
        mots.forEach(function (mot) {
          var essai = ligne ? ligne + ' ' + mot : mot;
          if (!ligne || police.widthOfTextAtSize(essai, taille) <= maxLargeur) ligne = essai;
          else { resultat.push(ligne); ligne = mot; }
        });
        if (ligne) resultat.push(ligne);
      });
      return resultat.length ? resultat : [''];
    }

    function paragraphe(page, valeur, x, y, maxLargeur, options) {
      options = options || {};
      var police = options.bold ? bold : regular, taille = options.taille || 10;
      var interligne = options.interligne || Math.round(taille * 1.45);
      lignes(valeur, police, taille, maxLargeur).forEach(function (ligne) {
        page.drawText(ligne, { x: x, y: y, size: taille, font: police,
          color: options.couleur || c.texte, opacity: options.opacity == null ? 1 : options.opacity });
        y -= interligne;
      });
      return y;
    }

    function marque(page, x, y, echelle, inverse) {
      var s = echelle || 1;
      page.drawRectangle({ x:x, y:y, width:40*s, height:48*s, color:inverse ? c.surface : c.nuit,
        borderColor:inverse ? c.ciel : c.ciel, borderWidth:2*s });
      page.drawRectangle({ x:x + 5*s, y:y + 5*s, width:5*s, height:38*s, color:c.cyan });
      page.drawText('M', { x:x + 14*s, y:y + 15*s, size:22*s, font:bold,
        color:inverse ? c.nuit : c.ciel });
    }

    function fondPage(page) {
      page.drawRectangle({ x:0, y:0, width:largeur, height:hauteur, color:c.fond });
    }

    function pageCouverture(options) {
      options = options || {};
      var page = pdf.addPage(PDFLib.PageSizes.A4);
      page.drawRectangle({ x:0, y:0, width:largeur, height:hauteur, color:c.nuit });
      page.drawRectangle({ x:0, y:0, width:12, height:hauteur, color:c.cyan });
      page.drawCircle({ x:535, y:790, size:92, color:c.ciel, opacity:.10 });
      page.drawCircle({ x:555, y:745, size:52, color:c.cyan, opacity:.12 });
      page.drawCircle({ x:70, y:85, size:130, color:c.action, opacity:.22 });
      marque(page, 50, 728, 1.05, false);
      page.drawText('MAXILOU', { x:104, y:759, size:11, font:bold, color:c.surface });
      page.drawText('DEMO RACING', { x:104, y:742, size:8, font:regular, color:c.ciel });
      page.drawText(texte(options.surtitre || 'DOSSIER DE TOURNOI'),
        { x:50, y:655, size:10, font:bold, color:c.cyan });
      var titreY = 610;
      lignes(options.titre || 'Dossier', bold, 32, 490).slice(0, 3).forEach(function (ligne) {
        page.drawText(ligne, { x:50, y:titreY, size:32, font:bold, color:c.surface }); titreY -= 39;
      });
      titreY -= 4;
      paragraphe(page, options.sousTitre || '', 50, titreY, 485,
        { taille:13, interligne:19, couleur:c.ciel });
      if (options.statut) {
        var statut = texte(options.statut).toUpperCase();
        var sw = Math.min(260, bold.widthOfTextAtSize(statut, 9) + 28);
        page.drawRectangle({ x:50, y:390, width:sw, height:28, color:c.selection,
          borderColor:c.ciel, borderWidth:1 });
        page.drawText(statut, { x:64, y:400, size:9, font:bold, color:c.action });
      }
      return page;
    }

    function nouvellePage(surtitre, titre) {
      var page = pdf.addPage(PDFLib.PageSizes.A4);
      fondPage(page);
      page.drawRectangle({ x:0, y:788, width:largeur, height:54, color:c.nuit });
      marque(page, 38, 795, .75, false);
      page.drawText(texte(surtitre || 'MAXILOU'), { x:79, y:819, size:7, font:bold, color:c.cyan });
      page.drawText(texte(titre || ''), { x:79, y:800, size:15, font:bold, color:c.surface });
      return page;
    }

    function etiquette(page, libelle, x, y, options) {
      options = options || {};
      var valeur = texte(libelle).toUpperCase(), taille = options.taille || 8;
      var w = Math.min(options.max || 250, bold.widthOfTextAtSize(valeur, taille) + 20);
      page.drawRectangle({ x:x, y:y, width:w, height:22, color:options.fond || c.selection,
        borderColor:options.bordure || c.ciel, borderWidth:.7 });
      page.drawText(valeur, { x:x + 10, y:y + 7, size:taille, font:bold,
        color:options.couleur || c.action });
      return w;
    }

    function carte(page, options) {
      options = options || {};
      page.drawRectangle({ x:options.x + 2, y:options.y - 2, width:options.w, height:options.h,
        color:c.bordure, opacity:.45 });
      page.drawRectangle({ x:options.x, y:options.y, width:options.w, height:options.h,
        color:options.fond || c.surface, borderColor:options.bordure || c.bordure, borderWidth:.8 });
      page.drawRectangle({ x:options.x, y:options.y, width:5, height:options.h,
        color:options.accent || c.cyan });
      if (options.surtitre) page.drawText(texte(options.surtitre).toUpperCase(),
        { x:options.x + 16, y:options.y + options.h - 22, size:7, font:bold, color:c.action });
      if (options.titre) page.drawText(texte(options.titre),
        { x:options.x + 16, y:options.y + options.h - (options.surtitre ? 43 : 25), size:12, font:bold, color:c.texte });
      if (options.texte) paragraphe(page, options.texte, options.x + 16,
        options.y + options.h - (options.titre ? (options.surtitre ? 64 : 47) : 26), options.w - 30,
        { taille:options.taille || 9, interligne:options.interligne || 13, couleur:options.couleur || c.secondaire });
    }

    function metrique(page, options) {
      page.drawRectangle({ x:options.x, y:options.y, width:options.w, height:options.h,
        color:options.fond || c.selection, borderColor:options.bordure || c.ciel, borderWidth:.8 });
      page.drawText(texte(options.valeur), { x:options.x + 14, y:options.y + options.h - 30,
        size:options.taille || 22, font:bold, color:options.couleur || c.action });
      paragraphe(page, options.libelle, options.x + 14, options.y + 13, options.w - 28,
        { taille:8, interligne:11, couleur:c.secondaire });
    }

    function pieds(libelle, pagesCibles) {
      var toutes = pdf.getPages(), pages = pagesCibles || toutes, total = toutes.length;
      pages.forEach(function (page) {
        var index = toutes.indexOf(page);
        page.drawRectangle({ x:38, y:38, width:519, height:.7, color:c.bordure });
        page.drawText('MAXILOU  /  ' + texte(libelle || 'DOSSIER TOURNOI'),
          { x:38, y:22, size:7, font:bold, color:index === 0 ? c.ciel : c.secondaire });
        var numero = (index + 1) + ' / ' + total;
        page.drawText(numero, { x:557 - regular.widthOfTextAtSize(numero, 7), y:22,
          size:7, font:regular, color:index === 0 ? c.ciel : c.secondaire });
      });
    }

    return { pdf:pdf, PDFLib:PDFLib, regular:regular, bold:bold, c:c, largeur:largeur,
      hauteur:hauteur, texte:texte, lignes:lignes, paragraphe:paragraphe, marque:marque,
      fondPage:fondPage, pageCouverture:pageCouverture, nouvellePage:nouvellePage,
      etiquette:etiquette, carte:carte, metrique:metrique, pieds:pieds };
  }

  racine.PdfCielVerre = { couleurs:HEX, texte:texte, creer:creer };
})(typeof window !== 'undefined' ? window : this);
