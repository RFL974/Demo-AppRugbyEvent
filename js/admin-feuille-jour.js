/**
 * ============================================================================
 *  ADMIN — FEUILLE DE FIN DE JOURNÉE
 * ============================================================================
 *  Bilan de la journée : TOUS les matchs dans l'ordre CHRONOLOGIQUE, avec leur
 *  score. Trois usages :
 *    1) affichage à l'écran (carte #bloc-feuille-jour) ;
 *    2) téléchargement en PDF (pdf-lib, 100 % navigateur — aucun backend) ;
 *    3) envoi par email aux clubs, sur l'adresse qui a servi à les inviter.
 *
 *  Rien n'est inventé : un match sans score est affiché « — », un match non
 *  terminé garde son statut. L'ordre est celui de l'HORLOGE (heure de début),
 *  pas celui des phases : c'est la journée telle qu'elle s'est déroulée.
 *
 *  Dépend de : commun.js (echapper, comparerCategorie, afficherMessage,
 *  estTermine), admin.js (configCourante, equipesCourantes, matchsCourants,
 *  dialogConfirmer, avecBoutonOccupe), api.js (apiPostProtege), et de
 *  js/vendor/pdf-lib.min.js pour le PDF. Chargé après admin.js.
 * ============================================================================
 */

/** Nom lisible d'une équipe (id → nom), ou l'id si l'équipe n'existe plus. */
function nomEquipeFeuille(id) {
  const brut = String(id == null ? '' : id).trim();
  if (!brut) return '';
  const e = (typeof equipesCourantes !== 'undefined' && equipesCourantes || [])
    .find(function (x) { return String(x.id_equipe) === brut; });
  return e ? String(e.nom_equipe) : brut;
}

/** « 09:30 » → 570 (minutes depuis minuit). Renvoie null si l'heure est illisible :
 *  un match sans heure ne doit pas se retrouver arbitrairement en tête de journée. */
function minutesDeHeure(h) {
  const m = String(h == null ? '' : h).trim().match(/^(\d{1,2})[:hH](\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Libellé de la phase d'un match, tel qu'on le montre aux clubs. */
function libellePhaseFeuille(match) {
  const p = String((match && match.phase) || '').trim().toLowerCase();
  if (p === 'classement') return 'Après-midi';
  if (p === 'poule' || p === '') return 'Matin (poules)';
  return String(match.phase);
}

/**
 * Tous les matchs de la journée, triés dans l'ORDRE CHRONOLOGIQUE : heure de début, puis
 * terrain (deux matchs à la même heure sur des terrains différents), puis catégorie — ce qui
 * donne un ordre stable et reproductible. Les matchs SANS heure lisible sont rejetés à la fin
 * (ils ne sont pas perdus, mais ne prétendent pas à une place dans la chronologie).
 * PUR : ne lit que la liste passée en argument.
 */
function matchsChronologiques(matchs) {
  return (matchs || []).slice().sort(function (a, b) {
    const ma = minutesDeHeure(a.heure_debut), mb = minutesDeHeure(b.heure_debut);
    if (ma == null && mb == null) return 0;
    if (ma == null) return 1;   // sans heure → à la fin
    if (mb == null) return -1;
    if (ma !== mb) return ma - mb;
    const ta = String(a.terrain || ''), tb = String(b.terrain || '');
    const na = parseInt(ta, 10), nb = parseInt(tb, 10);
    if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (typeof comparerCategorie === 'function')
      ? comparerCategorie(String(a.categorie || ''), String(b.categorie || ''))
      : 0;
  });
}

/** Score affichable d'un match : « 12 – 7 », ou « — » tant qu'il n'est pas saisi.
 *  On n'affiche JAMAIS 0 – 0 pour un match non joué : ce serait un résultat inventé. */
function scoreFeuille(match) {
  const a = String(match.score_A == null ? '' : match.score_A).trim();
  const b = String(match.score_B == null ? '' : match.score_B).trim();
  if (a === '' || b === '') return '—';
  return a + ' – ' + b;
}

/** Compteurs de la journée : total, joués (score saisi), restants. */
function bilanFeuille(matchs) {
  let joues = 0;
  (matchs || []).forEach(function (m) { if (scoreFeuille(m) !== '—') joues++; });
  return { total: (matchs || []).length, joues: joues, restants: (matchs || []).length - joues };
}

/** Lignes de la feuille, prêtes à l'affichage / au PDF / à l'email (source unique). */
function lignesFeuilleJour() {
  const matchs = (typeof matchsCourants !== 'undefined' && matchsCourants) ? matchsCourants : [];
  return matchsChronologiques(matchs).map(function (m) {
    return {
      heure: String(m.heure_debut || '—'),
      categorie: String(m.categorie || ''),
      phase: libellePhaseFeuille(m),
      terrain: String(m.terrain || ''),
      equipeA: nomEquipeFeuille(m.equipe_A),
      equipeB: nomEquipeFeuille(m.equipe_B),
      score: scoreFeuille(m),
      termine: (typeof estTermine === 'function') ? estTermine(m.statut) : false
    };
  });
}

/** Titre du document (nom du tournoi + date), commun à l'écran, au PDF et à l'email. */
function titreFeuilleJour() {
  const g = (typeof configCourante !== 'undefined' && configCourante && configCourante.global) || {};
  const nom = String(g.tournoi_nom || 'Tournoi').trim();
  const d = String(g.tournoi_date || '').trim();
  const mm = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return { nom: nom, date: mm ? (mm[3] + '/' + mm[2] + '/' + mm[1]) : d };
}

/** Rend la feuille dans la carte admin. */
function majFeuilleJour() {
  const zone = document.getElementById('feuille-jour-contenu');
  if (!zone) return;
  const lignes = lignesFeuilleJour();
  if (!lignes.length) {
    zone.innerHTML = '<p class="vide">Aucun match pour le moment — génère le planning d\'abord.</p>';
    return;
  }
  const b = bilanFeuille(lignes.map(function (l) { return { score_A: l.score === '—' ? '' : '1', score_B: l.score === '—' ? '' : '1' }; }));
  const t = titreFeuilleJour();

  let h = '<p class="feuille-jour-titre"><strong>' + echapper(t.nom) + '</strong>' +
          (t.date ? ' — ' + echapper(t.date) : '') + '</p>';
  h += '<p class="feuille-jour-bilan">' + b.total + ' match(s) · <strong>' + b.joues +
       '</strong> avec score' + (b.restants ? ' · ' + b.restants + ' en attente' : '') + '</p>';
  h += '<div class="tab-capacite-wrap"><table class="tab-feuille-jour"><thead><tr>' +
       '<th>Heure</th><th>Cat.</th><th>Terrain</th><th>Match</th><th>Score</th><th>Moment</th>' +
       '</tr></thead><tbody>';
  lignes.forEach(function (l) {
    h += '<tr' + (l.score === '—' ? ' class="fj-attente"' : '') + '>' +
      '<td>' + echapper(l.heure) + '</td>' +
      '<td>' + echapper(l.categorie) + '</td>' +
      '<td>' + echapper(l.terrain) + '</td>' +
      '<td class="fj-match">' + echapper(l.equipeA) + ' <span class="vs">vs</span> ' + echapper(l.equipeB) + '</td>' +
      '<td class="fj-score">' + echapper(l.score) + '</td>' +
      '<td class="fj-phase">' + echapper(l.phase) + '</td>' +
      '</tr>';
  });
  h += '</tbody></table></div>';
  zone.innerHTML = h;
}

/* ==========================================================================
   PDF — document créé de zéro avec pdf-lib (aucun gabarit, aucun backend).
   Mise en page simple et lisible : titre, bilan, puis le tableau paginé.
   ========================================================================== */

/** Colonnes du PDF : largeur (pt) et clé de la ligne. */
var FJ_COLONNES = [
  { cle: 'heure',     titre: 'Heure',   w: 45 },
  { cle: 'categorie', titre: 'Cat.',    w: 40 },
  { cle: 'terrain',   titre: 'Terrain', w: 45 },
  { cle: 'match',     titre: 'Match',   w: 250 },
  { cle: 'score',     titre: 'Score',   w: 60 },
  { cle: 'phase',     titre: 'Moment',  w: 85 }
];

/** Tronque un texte pour qu'il tienne dans `largeur` points à la taille donnée. */
function tronquerPdf(texte, police, taille, largeur) {
  let s = String(texte == null ? '' : texte);
  if (police.widthOfTextAtSize(s, taille) <= largeur) return s;
  while (s.length > 1 && police.widthOfTextAtSize(s + '…', taille) > largeur) s = s.slice(0, -1);
  return s + '…';
}

/** Construit le PDF de la feuille de journée et déclenche son téléchargement. */
async function onTelechargerFeuilleJourPdf() {
  const message = document.getElementById('message-feuille-jour');
  const bouton = document.getElementById('bouton-feuille-jour-pdf');
  const lignes = lignesFeuilleJour();
  if (!lignes.length) { afficherMessage(message, 'Aucun match à mettre dans le PDF.', 'ko'); return; }
  if (typeof PDFLib === 'undefined') { afficherMessage(message, '⚠️ Bibliothèque PDF indisponible.', 'ko'); return; }

  await avecBoutonOccupe(bouton, message, async function () {
    const doc = await PDFLib.PDFDocument.create();
    const helv = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const gras = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const noir = PDFLib.rgb(0.08, 0.08, 0.10);
    const gris = PDFLib.rgb(0.45, 0.48, 0.52);
    const trait = PDFLib.rgb(0.80, 0.84, 0.88);
    const t = titreFeuilleJour();
    const b = { total: lignes.length, joues: lignes.filter(function (l) { return l.score !== '—'; }).length };

    const MARGE = 40, HAUT = 792, LARGE = 612; // A4 « letter-like » : 612×792 pt
    let page = null, y = 0;

    function entetePage(premiere) {
      page = doc.addPage([LARGE, HAUT]);
      y = HAUT - MARGE;
      if (premiere) {
        page.drawText('Feuille de fin de journée', { x: MARGE, y: y, size: 18, font: gras, color: noir });
        y -= 22;
        page.drawText(t.nom + (t.date ? ' — ' + t.date : ''), { x: MARGE, y: y, size: 12, font: helv, color: noir });
        y -= 16;
        page.drawText(b.total + ' match(s) · ' + b.joues + ' avec score', { x: MARGE, y: y, size: 10, font: helv, color: gris });
        y -= 22;
      }
      // Ligne d'en-tête du tableau (répétée sur chaque page).
      let x = MARGE;
      FJ_COLONNES.forEach(function (c) {
        page.drawText(c.titre, { x: x, y: y, size: 9, font: gras, color: gris });
        x += c.w;
      });
      y -= 6;
      page.drawLine({ start: { x: MARGE, y: y }, end: { x: LARGE - MARGE, y: y }, thickness: 0.8, color: trait });
      y -= 14;
    }

    entetePage(true);
    lignes.forEach(function (l) {
      if (y < MARGE + 24) entetePage(false);   // plus de place → page suivante
      const valeurs = {
        heure: l.heure, categorie: l.categorie, terrain: l.terrain,
        match: l.equipeA + '  vs  ' + l.equipeB, score: l.score, phase: l.phase
      };
      let x = MARGE;
      FJ_COLONNES.forEach(function (c) {
        const enAttente = (c.cle === 'score' && l.score === '—');
        page.drawText(tronquerPdf(valeurs[c.cle], helv, 9.5, c.w - 6), {
          x: x, y: y, size: 9.5, font: (c.cle === 'score' && !enAttente) ? gras : helv,
          color: enAttente ? gris : noir
        });
        x += c.w;
      });
      y -= 15;
    });

    const octets = await doc.save();
    const nomFichier = 'feuille-de-journee-' +
      (t.date ? t.date.replace(/\//g, '-') : 'tournoi') + '.pdf';
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
    lien.download = nomFichier;
    document.body.appendChild(lien);
    lien.click();
    setTimeout(function () { URL.revokeObjectURL(lien.href); lien.remove(); }, 2000);
    afficherMessage(message, '✅ PDF téléchargé (' + nomFichier + ').', 'ok');
  });
}

/* ==========================================================================
   ENVOI AUX CLUBS — sur l'adresse qui a servi à les inviter.
   L'email part du BACKEND (action protégée) ; le front fournit le contenu.
   ========================================================================== */

/** Corps HTML de l'email envoyé aux clubs (même contenu que la feuille à l'écran). */
function htmlEmailFeuilleJour() {
  const t = titreFeuilleJour();
  const lignes = lignesFeuilleJour();
  let h = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0C1C2E">' +
    '<h2 style="margin:0 0 4px">Feuille de fin de journée</h2>' +
    '<p style="margin:0 0 14px;color:#5a6b7c">' + echapper(t.nom) +
    (t.date ? ' — ' + echapper(t.date) : '') + '</p>' +
    '<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px">' +
    '<tr style="background:#F5F9FD">' +
      '<th align="left">Heure</th><th align="left">Cat.</th><th align="left">Terrain</th>' +
      '<th align="left">Match</th><th align="left">Score</th><th align="left">Moment</th></tr>';
  lignes.forEach(function (l) {
    h += '<tr style="border-top:1px solid #e6edf5">' +
      '<td>' + echapper(l.heure) + '</td><td>' + echapper(l.categorie) + '</td>' +
      '<td>' + echapper(l.terrain) + '</td>' +
      '<td>' + echapper(l.equipeA) + ' vs ' + echapper(l.equipeB) + '</td>' +
      '<td><strong>' + echapper(l.score) + '</strong></td>' +
      '<td style="color:#5a6b7c">' + echapper(l.phase) + '</td></tr>';
  });
  h += '</table><p style="margin-top:16px;color:#5a6b7c">Merci de votre participation !</p></div>';
  return h;
}

/** Version texte de repli (clients email sans HTML). */
function texteEmailFeuilleJour() {
  const t = titreFeuilleJour();
  const lignes = lignesFeuilleJour();
  return 'Feuille de fin de journée — ' + t.nom + (t.date ? ' (' + t.date + ')' : '') + '\n\n' +
    lignes.map(function (l) {
      return l.heure + '  ' + l.categorie + '  T' + l.terrain + '  ' +
             l.equipeA + ' vs ' + l.equipeB + '  : ' + l.score + '  (' + l.phase + ')';
    }).join('\n') + '\n\nMerci de votre participation !';
}

/** Envoie la feuille aux clubs invités ACCEPTÉS, après confirmation explicite. */
async function onEnvoyerFeuilleJour() {
  const message = document.getElementById('message-feuille-jour');
  const bouton = document.getElementById('bouton-feuille-jour-envoi');
  const lignes = lignesFeuilleJour();
  if (!lignes.length) { afficherMessage(message, 'Aucun match : rien à envoyer.', 'ko'); return; }

  // Destinataires : les clubs acceptés qui ont une adresse d'invitation.
  const clubs = (typeof clubsInvitesCourants !== 'undefined' && clubsInvitesCourants) ? clubsInvitesCourants : [];
  const accepte = function (c) {
    return (typeof estAccepte === 'function') ? estAccepte(c.statut)
      : String(c.statut == null ? '' : c.statut).trim().toLowerCase() === 'accepté';
  };
  const destinataires = clubs.filter(function (c) { return accepte(c) && String(c.club_contact_email || '').trim(); });
  if (!destinataires.length) {
    afficherMessage(message, '⚠️ Aucun club accepté avec une adresse email : rien à envoyer.', 'ko');
    return;
  }
  const sansEmail = clubs.filter(function (c) { return accepte(c) && !String(c.club_contact_email || '').trim(); })
                         .map(function (c) { return String(c.club_nom); });
  const enAttente = lignes.filter(function (l) { return l.score === '—'; }).length;

  const ok = await dialogConfirmer(
    'Envoyer la feuille de fin de journée à ' + destinataires.length + ' club(s) ?\n\n' +
    destinataires.map(function (c) { return c.club_nom + ' → ' + c.club_contact_email; }).join('\n') +
    (sansEmail.length ? '\n\nSans adresse (non contactés) : ' + sansEmail.join(', ') + '.' : '') +
    (enAttente ? '\n\n⚠️ ' + enAttente + ' match(s) sont encore SANS SCORE : ils partiront avec « — ».' : '') +
    '\n\nL\'email part sur l\'adresse qui a servi à les inviter.',
    { ok: 'Envoyer' });
  if (!ok) return;

  await avecBoutonOccupe(bouton, message, async function () {
    const t = titreFeuilleJour();
    const rep = await apiPostProtege('envoyerFeuilleJour', {
      sujet: 'Résultats — ' + t.nom + (t.date ? ' (' + t.date + ')' : ''),
      html_modele: htmlEmailFeuilleJour(),
      texte_modele: texteEmailFeuilleJour()
    }, 'admin', 'admin');
    const n = (rep && rep.envoyes != null) ? rep.envoyes : destinataires.length;
    const echecs = (rep && rep.echecs) || [];
    afficherMessage(message, echecs.length
      ? '⚠️ ' + n + ' envoi(s) réussi(s), échec pour : ' + echecs.join(', ')
      : '✅ Feuille envoyée à ' + n + ' club(s).', echecs.length ? 'ko' : 'ok');
  });
}

/* Câblage des deux boutons, en délégation sur la carte (même motif que la demande
   d'autorisation) : posé une fois au chargement, insensible aux re-rendus du contenu. */
document.addEventListener('DOMContentLoaded', function () {
  const section = document.getElementById('bloc-feuille-jour');
  if (!section) return;
  section.addEventListener('click', function (e) {
    if (e.target.closest('#bouton-feuille-jour-pdf')) { e.preventDefault(); onTelechargerFeuilleJourPdf(); }
    else if (e.target.closest('#bouton-feuille-jour-envoi')) { e.preventDefault(); onEnvoyerFeuilleJour(); }
  });
});
