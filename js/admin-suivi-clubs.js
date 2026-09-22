/**
 * Tableau de suivi des clubs : réponse, restauration, montant dû et règlement.
 * Les montants et quantités viennent du récapitulatif figé lors de la réponse du club.
 */

let suiviClubsFiltre = 'tous';

/* Le club dont la fiche est ouverte dans le panneau latéral, et l'état déplié de cette fiche.
   ⭐ Portés par le MODULE, pas par le DOM : `afficherSuiviClubs()` repeint la liste à chaque
   écriture et à chaque relecture ; un repère posé dans le HTML disparaîtrait avec elle, et la
   fiche se refermerait toute seule sous les doigts de l'organisateur. */
let suiviClubSelectionne = '';
let suiviFicheDepliee = false;

/** Un nombre à partir d'un montant figé (texte « 5.00 » ou « 5,00 »). Jamais NaN. */
function suiviNombre(valeur) {
  const n = Number(String(valeur == null ? '' : valeur).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function suiviClubDetail(club) {
  try {
    const detail = JSON.parse(String((club && club.detail_effectifs) || '{}')) || {};
    return detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {};
  } catch (e) { return {}; }
}

function suiviClubCommande(club) {
  const detail = suiviClubDetail(club);
  const commande = detail._restauration && typeof detail._restauration === 'object'
    ? detail._restauration : {};
  // ⭐ Le prix unitaire et le sous-total FIGÉS lors de la réponse du club sont conservés tels
  //    quels : la fiche détaille « 22 × 5 € » sans recalculer quoi que ce soit, et sans jamais
  //    relire les tarifs courants — qui ont pu changer depuis que le club a commandé.
  function prestation(nom) {
    const p = commande[nom] || {};
    return {
      joueurs: Math.max(0, Number(p.joueurs) || 0),
      educateurs: Math.max(0, Number(p.educateurs) || 0),
      prix: suiviNombre(p.prix_unitaire),
      sousTotal: suiviNombre(p.sous_total)
    };
  }
  const total = Number(String(commande.total == null ? '' : commande.total).replace(',', '.'));
  // ⛔ Plus de `montantRepas` / `montantGouter` : ils doublaient `repas.sousTotal` et
  //    `gouter.sousTotal` que `prestation()` expose désormais — deux champs pour le même
  //    montant, c'est par là qu'une divergence commence. (Et leur `Number('5,00')` rendait NaN
  //    sur un montant à virgule, là où `suiviNombre` le lit.)
  return { repas: prestation('repas'), gouter: prestation('gouter'),
    total: Number.isFinite(total) ? Math.max(0, total) : 0, inscription: commande.inscription || {} };
}

function suiviEntierPositif(valeur) {
  const n = parseInt(valeur, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Effectifs annoncés, avec repli sur le détail des équipes pour les anciennes réponses. */
function suiviClubEffectifs(club) {
  const detail = suiviClubDetail(club);
  let joueursDetail = 0, educateursDetail = 0;
  Object.keys(detail).forEach(function (categorie) {
    if (categorie === '_restauration' || !Array.isArray(detail[categorie])) return;
    detail[categorie].forEach(function (equipe) {
      joueursDetail += Math.max(0, Number(equipe && equipe.j) || 0);
      educateursDetail += Math.max(0, Number(equipe && equipe.e) || 0);
    });
  });
  const joueurs = suiviEntierPositif(club && club.nb_joueurs_total);
  const educateurs = suiviEntierPositif(club && club.nb_educateurs_total);
  return {
    joueurs: joueurs == null ? joueursDetail : joueurs,
    educateurs: educateurs == null ? educateursDetail : educateurs
  };
}

function suiviPrestationReglage(type, global) {
  const actif = type === 'repas' ? estOui(global.repas_sur_place_oui) : estOui(global.gouter_fin_tournoi_oui);
  const mode = String(type === 'repas' ? global.repas_sur_place_mode : global.gouter_fin_tournoi_mode).trim();
  const libelles = {
    prix_personne: 'Commandes payantes',
    compris_inscription: 'Compris dans l\'inscription',
    offert_organisateur: 'Offert par l\'organisateur'
  };
  return { actif: actif, mode: mode, libelle: actif ? (libelles[mode] || 'Commandes déclarées') : 'Non proposé' };
}

/** Données figées du PDF : aucun appel réseau et aucune écriture métier.
 *  ⚠️ PORTÉE : les commandes saisies par les CLUBS INVITÉS qui participent (jeu de démonstration : 9 clubs, 262 joueurs). L'organisateur
 *  (RACING 92, 4 équipes, 65 joueurs) ne remplit pas ce parcours : il n'y figure pas — ce n'est PAS un décompte des 327 joueurs du
 *  tournoi. Compter d'office ses joueurs supposerait qu'ils commandent tous un repas ; une saisie dédiée serait une décision produit. */
function suiviDonneesRestauration(clubs, global) {
  const g = global || {};
  const reglages = {
    repas: suiviPrestationReglage('repas', g),
    gouter: suiviPrestationReglage('gouter', g)
  };
  const lignes = (clubs || []).filter(function (club) { return estAccepte(club.statut); })
    .map(function (club) {
      const effectifs = suiviClubEffectifs(club);
      const commande = suiviClubCommande(club);
      function quantites(type) {
        const reglage = reglages[type];
        if (!reglage.actif) return { joueurs: 0, educateurs: 0, total: 0 };
        const q = (reglage.mode === 'compris_inscription' || reglage.mode === 'offert_organisateur')
          ? effectifs : commande[type];
        return { joueurs: q.joueurs, educateurs: q.educateurs, total: q.joueurs + q.educateurs };
      }
      return {
        club: String(club.club_nom || 'Club sans nom').trim() || 'Club sans nom',
        effectifs: effectifs, repas: quantites('repas'), gouter: quantites('gouter')
      };
    }).sort(function (a, b) { return a.club.localeCompare(b.club, 'fr'); });
  const totaux = lignes.reduce(function (acc, ligne) {
    ['repas', 'gouter'].forEach(function (type) {
      acc[type].joueurs += ligne[type].joueurs;
      acc[type].educateurs += ligne[type].educateurs;
      acc[type].total += ligne[type].total;
    });
    return acc;
  }, { repas: { joueurs: 0, educateurs: 0, total: 0 }, gouter: { joueurs: 0, educateurs: 0, total: 0 } });
  return { lignes: lignes, totaux: totaux, reglages: reglages };
}

function suiviPdfTexte(texte) {
  return String(texte == null ? '' : texte)
    .replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-').replace(/\u0153/g, 'oe').replace(/\u0152/g, 'OE')
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, '');
}

function suiviPdfTronquer(texte, police, taille, largeur) {
  let s = suiviPdfTexte(texte);
  if (police.widthOfTextAtSize(s, taille) <= largeur) return s;
  while (s.length > 1 && police.widthOfTextAtSize(s + '...', taille) > largeur) s = s.slice(0, -1);
  return s + '...';
}

/** Crée le document PDF et renvoie ses octets, afin de pouvoir tester le rendu sans téléchargement. */
async function creerPdfSuiviRestauration(donnees, global) {
  const doc = await PDFLib.PDFDocument.create();
  const normal = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const gras = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const bleu = PDFLib.rgb(0.08, 0.22, 0.38);
  const accent = PDFLib.rgb(0.18, 0.56, 0.88);
  const pale = PDFLib.rgb(0.94, 0.97, 0.99);
  const gris = PDFLib.rgb(0.38, 0.44, 0.52);
  const trait = PDFLib.rgb(0.82, 0.86, 0.91);
  const noir = PDFLib.rgb(0.08, 0.11, 0.16);
  const LARGEUR = 842, HAUTEUR = 595, MARGE = 36;
  const colonnes = [
    { titre: 'Club', w: 190, cle: 'club' }, { titre: 'Joueurs', w: 54, cle: 'joueurs' },
    { titre: 'Éduc.', w: 54, cle: 'educateurs' }, { titre: 'Repas J.', w: 62, cle: 'repasJ' },
    { titre: 'Repas E.', w: 62, cle: 'repasE' }, { titre: 'Repas', w: 62, cle: 'repas' },
    { titre: 'Goûters J.', w: 66, cle: 'gouterJ' }, { titre: 'Goûters E.', w: 66, cle: 'gouterE' },
    { titre: 'Goûters', w: 64, cle: 'gouter' }
  ];
  const g = global || {};
  const nomTournoi = String(g.tournoi_nom || 'Tournoi').trim() || 'Tournoi';
  const dateTournoi = suiviDate(g.tournoi_date || '');
  let page, y;

  function ajouterEntete(premiere) {
    page = doc.addPage([LARGEUR, HAUTEUR]);
    y = HAUTEUR - MARGE;
    if (premiere) {
      page.drawText('Préparation des repas et goûters', { x: MARGE, y: y, size: 20, font: gras, color: bleu });
      y -= 25;
      page.drawText(suiviPdfTronquer(nomTournoi + (dateTournoi ? ' - ' + dateTournoi : ''), normal, 11, 500),
        { x: MARGE, y: y, size: 11, font: normal, color: noir });
      y -= 19;
      page.drawText('Repas : ' + suiviPdfTexte(donnees.reglages.repas.libelle) + '   |   Goûters : ' +
        suiviPdfTexte(donnees.reglages.gouter.libelle), { x: MARGE, y: y, size: 9.5, font: normal, color: gris });
      y -= 27;
    } else {
      page.drawText('Préparation des repas et goûters - suite', { x: MARGE, y: y, size: 13, font: gras, color: bleu });
      y -= 24;
    }
    page.drawRectangle({ x: MARGE, y: y - 7, width: LARGEUR - 2 * MARGE, height: 24, color: pale });
    let x = MARGE + 5;
    colonnes.forEach(function (colonne) {
      page.drawText(colonne.titre, { x: x, y: y, size: 8.5, font: gras, color: bleu });
      x += colonne.w;
    });
    y -= 17;
  }

  ajouterEntete(true);
  donnees.lignes.forEach(function (ligne) {
    if (y < 94) ajouterEntete(false);
    const valeurs = {
      club: ligne.club, joueurs: ligne.effectifs.joueurs, educateurs: ligne.effectifs.educateurs,
      repasJ: ligne.repas.joueurs, repasE: ligne.repas.educateurs, repas: ligne.repas.total,
      gouterJ: ligne.gouter.joueurs, gouterE: ligne.gouter.educateurs, gouter: ligne.gouter.total
    };
    let x = MARGE + 5;
    colonnes.forEach(function (colonne) {
      const total = colonne.cle === 'repas' || colonne.cle === 'gouter';
      page.drawText(suiviPdfTronquer(valeurs[colonne.cle], total ? gras : normal, 9, colonne.w - 8), {
        x: x, y: y, size: 9, font: total ? gras : normal, color: noir
      });
      x += colonne.w;
    });
    y -= 9;
    page.drawLine({ start: { x: MARGE, y: y }, end: { x: LARGEUR - MARGE, y: y }, thickness: 0.5, color: trait });
    y -= 13;
  });

  if (y < 92) ajouterEntete(false);
  y -= 4;
  const largeurCarte = 238;
  [
    { x: MARGE, titre: 'TOTAL REPAS À PRÉPARER', q: donnees.totaux.repas },
    { x: MARGE + largeurCarte + 16, titre: 'TOTAL GOÛTERS À PRÉPARER', q: donnees.totaux.gouter }
  ].forEach(function (carte) {
    page.drawRectangle({ x: carte.x, y: y - 49, width: largeurCarte, height: 58, color: pale,
      borderColor: accent, borderWidth: 1 });
    page.drawText(carte.titre, { x: carte.x + 12, y: y - 9, size: 8.5, font: gras, color: bleu });
    page.drawText(String(carte.q.total), { x: carte.x + 12, y: y - 36, size: 21, font: gras, color: accent });
    page.drawText(carte.q.joueurs + ' joueurs + ' + carte.q.educateurs + ' éducateurs',
      { x: carte.x + 52, y: y - 33, size: 8.5, font: normal, color: gris });
  });
  page.drawText('Document généré depuis le suivi des clubs - seuls les clubs participants sont comptés.',
    { x: MARGE, y: 24, size: 8, font: normal, color: gris });
  return doc.save();
}

async function onTelechargerPdfSuiviRestauration() {
  const message = document.getElementById('message-suivi-clubs');
  const bouton = document.getElementById('bouton-pdf-suivi-restauration');
  const g = (configCourante && configCourante.global) || {};
  const donnees = suiviDonneesRestauration(clubsInvitesCourants || [], g);
  if (!donnees.lignes.length) {
    afficherMessage(message, 'Aucun club participant à inclure dans le PDF.', 'ko');
    return;
  }
  if (typeof PDFLib === 'undefined') {
    afficherMessage(message, '⚠️ Bibliothèque PDF indisponible.', 'ko');
    return;
  }
  await avecBoutonOccupe(bouton, message, async function () {
    const octets = await creerPdfSuiviRestauration(donnees, g);
    const date = String(g.tournoi_date || '').trim() || 'tournoi';
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
    lien.download = 'suivi-repas-gouters-' + date.replace(/[^0-9A-Za-z_-]+/g, '-') + '.pdf';
    document.body.appendChild(lien);
    lien.click();
    setTimeout(function () { URL.revokeObjectURL(lien.href); lien.remove(); }, 2000);
    afficherMessage(message, '✅ PDF téléchargé : ' + donnees.totaux.repas.total + ' repas et ' +
      donnees.totaux.gouter.total + ' goûters à préparer.', 'ok');
  }, 'Génération du PDF…');
}

function suiviClubEtat(club) {
  const accepte = estAccepte(club.statut);
  const decline = memeTexteSouple(club.statut, 'Décliné');
  const commande = suiviClubCommande(club);
  const paye = accepte && commande.total > 0 && memeTexteSouple(club.paiement_statut, 'Payé');
  return {
    accepte: accepte, decline: decline, attente: !accepte && !decline,
    inscription: etatClubInvite(club), dossierDisponible: dossierFinalDisponible(club),
    commande: commande, paye: paye,
    paiementAttendu: accepte && commande.total > 0 && !paye,
    confirmationAttendue: (accepte || decline) && !String(club.confirmation_reponse_envoyee || '').trim()
  };
}

function suiviEuros(montant) {
  return Number(montant || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

function suiviDate(valeur) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/.exec(String(valeur || '').trim());
  return m ? (m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' à ' + m[4] + ':' + m[5] : ''))
    : String(valeur || '').trim();
}

function suiviLibellePrestation(type, etat) {
  const quantite = etat.commande[type].joueurs + etat.commande[type].educateurs;
  if (quantite) return String(quantite) + (type === 'repas' ? ' repas' : ' goûter' + (quantite > 1 ? 's' : ''));
  const g = (configCourante && configCourante.global) || {};
  const actif = type === 'repas' ? estOui(g.repas_sur_place_oui) : estOui(g.gouter_fin_tournoi_oui);
  const mode = type === 'repas' ? g.repas_sur_place_mode : g.gouter_fin_tournoi_mode;
  if (!actif) return 'Non proposé';
  if (mode === 'compris_inscription') return 'Compris · quantité non demandée';
  if (mode === 'offert_organisateur') return 'Offert · quantité non demandée';
  return 'Aucun';
}

function suiviCorrespondFiltre(etat) {
  if (suiviClubsFiltre === 'attente') return etat.attente;
  if (suiviClubsFiltre === 'oui') return etat.accepte;
  if (suiviClubsFiltre === 'non') return etat.decline;
  if (suiviClubsFiltre === 'paiement') return etat.paiementAttendu;
  return true;
}

function suiviRangClub(club) {
  const e = suiviClubEtat(club);
  if (e.attente) return 0;
  if (e.paiementAttendu) return 1;
  if (e.accepte) return 2;
  return 3;
}

/* ============================================================================
 *  LE TABLEAU ET LA FICHE — un écran de lecture, une fiche d'action
 * ============================================================================
 *  La ligne répond à « où en est ce club ? » : un état par colonne, rien de plus. Tout le
 *  détail et toutes les actions vivent dans la FICHE, à droite, pour le club sélectionné.
 *
 *  ⭐ AUCUNE LECTURE RÉSEAU ICI. Le tableau, les compteurs, les filtres et la fiche sont tous
 *  calculés depuis `clubsInvitesCourants`, déjà en mémoire — la même liste que « Inviter un
 *  club ». Sélectionner un club ne demande donc rien au serveur : `suiviSelectionnerClub()`
 *  repeint la seule fiche, sans toucher au tableau.
 *
 *  ⛔ JAMAIS LA COULEUR SEULE (doctrine du lot précédent) : le liseré d'état de la ligne est
 *  toujours doublé de sa pastille écrite, dans la cellule « Club ».
 * ========================================================================== */

/** Deux lettres pour la vignette du club — le début de son nom, jamais une invention. */
function suiviInitiales(nom) {
  const propre = String(nom || '').trim();
  return (propre.slice(0, 2) || '??').toLocaleUpperCase('fr');
}

function suiviBadgeReponse(club, etat) {
  const trace = club.confirmation_reponse_envoyee
    ? '<small>Confirmation envoyée le ' + echapper(suiviDate(club.confirmation_reponse_envoyee)) + '</small>'
    : ((etat.accepte || etat.decline) ? '<small class="suivi-confirmation-a-renvoyer">Confirmation à renvoyer</small>' : '');
  if (etat.accepte) return '<span class="suivi-badge est-oui">Oui</span>' +
    (club.date_reponse ? '<small>Confirmée le ' + echapper(suiviDate(club.date_reponse)) + '</small>' : '') + trace;
  if (etat.decline) return '<span class="suivi-badge est-non">Non</span>' +
    (club.date_reponse ? '<small>Déclinée le ' + echapper(suiviDate(club.date_reponse)) + '</small>' : '') + trace;
  return '<span class="suivi-badge est-attente">En attente</span>' +
    (club.invitation_envoyee ? '<small>invitation envoyée le ' + echapper(suiviDate(club.invitation_envoyee)) + '</small>'
      : '<small>invitation non envoyée</small>');
}

/** La pastille de réponse, seule : c'est tout ce que la colonne « Réponse » du tableau porte. */
function suiviPastilleReponse(etat) {
  if (etat.accepte) return '<span class="suivi-badge est-oui">Oui</span>';
  if (etat.decline) return '<span class="suivi-badge est-non">Non</span>';
  return '<span class="suivi-badge est-attente">En attente</span>';
}

function suiviLibellePrestation(type, etat) {
  const quantite = etat.commande[type].joueurs + etat.commande[type].educateurs;
  if (quantite) return String(quantite) + (type === 'repas' ? ' repas' : ' goûter' + (quantite > 1 ? 's' : ''));
  const g = (configCourante && configCourante.global) || {};
  const actif = type === 'repas' ? estOui(g.repas_sur_place_oui) : estOui(g.gouter_fin_tournoi_oui);
  const mode = type === 'repas' ? g.repas_sur_place_mode : g.gouter_fin_tournoi_mode;
  if (!actif) return 'Non proposé';
  if (mode === 'compris_inscription') return 'Compris · quantité non demandée';
  if (mode === 'offert_organisateur') return 'Offert · quantité non demandée';
  return 'Aucun';
}

/**
 * La cellule compacte d'une prestation : un NOMBRE quand il y en a un, sinon un tiret qui dit
 * pourquoi au survol. ⛔ Jamais « 0 » là où la question n'a pas été posée au club : un zéro
 * affirme « aucun repas commandé », ce qui est faux quand les repas sont compris dans
 * l'inscription — le libellé long reste disponible dans le `title`.
 */
function suiviQuantitePrestation(type, etat) {
  const long = suiviLibellePrestation(type, etat);
  const quantite = etat.commande[type].joueurs + etat.commande[type].educateurs;
  if (etat.decline) return { texte: '—', titre: 'Le club ne participe pas' };
  if (!etat.accepte) return { texte: '—', titre: 'Le club n’a pas encore accepté' };
  if (quantite) return { texte: String(quantite), titre: long };
  return { texte: '—', titre: long };
}

/** L'état de paiement en un mot, pour la colonne du tableau. */
function suiviEtatPaiement(etat) {
  if (!etat.accepte) return { cle: 'neutre', libelle: 'Non concerné' };
  if (etat.commande.total <= 0) return { cle: 'neutre', libelle: 'Rien à payer' };
  if (etat.paye) return { cle: 'paye', libelle: 'Payé' };
  return { cle: 'du', libelle: 'En attente' };
}

/**
 * Le détail chiffré de la commande, ligne à ligne, tel que le club l'a figé.
 *
 * ⭐ LES FRAIS D'INSCRIPTION SONT UNE LIGNE COMME LES AUTRES. Sans eux, la somme des lignes ne
 * fait pas le total affiché juste en dessous — une fiche qui se contredit elle-même.
 * ⛔ Aucun prix n'est relu dans les réglages courants : un tarif modifié après la commande ne
 * doit pas réécrire ce que le club a validé.
 */
function suiviLignesCommande(etat) {
  const c = etat.commande;
  const lignes = [];
  const ins = c.inscription || {};
  const fraisInscription = suiviNombre(ins.sous_total);
  if (fraisInscription > 0) {
    const parClub = ins.mode === 'par_club';
    const nb = parClub ? 1 : Math.max(0, Number(ins.nb_equipes) || 0);
    lignes.push({
      libelle: 'Frais d’inscription', quantite: nb,
      unite: parClub ? 'club' : 'équipe' + (nb > 1 ? 's' : ''),
      prix: suiviNombre(ins.prix_unitaire), montant: fraisInscription
    });
  }
  [['repas', 'Repas'], ['gouter', 'Goûters']].forEach(function (paire) {
    const p = c[paire[0]];
    if (!p || (p.sousTotal <= 0 && !p.joueurs && !p.educateurs)) return;
    // Pas de prix unitaire figé (réponse ancienne) : une seule ligne, sans détail inventé.
    if (p.prix <= 0) {
      lignes.push({ libelle: paire[1], quantite: p.joueurs + p.educateurs, prix: 0, montant: p.sousTotal });
      return;
    }
    const deuxCotes = p.joueurs > 0 && p.educateurs > 0;
    [['joueurs', 'joueurs'], ['educateurs', 'éducateurs']].forEach(function (cote) {
      const q = p[cote[0]];
      if (!q) return;
      lignes.push({
        libelle: paire[1] + (deuxCotes ? ' ' + cote[1] : ''), quantite: q,
        prix: p.prix, montant: q * p.prix
      });
    });
  });
  return lignes;
}

function suiviHtmlLignesCommande(etat) {
  // ⛔ MÊME RÈGLE QUE LA LIGNE DU TABLEAU, qui affiche « — » tant que le club n'a pas accepté :
  //    un récapitulatif figé avant la réponse n'est pas une commande, et la fiche ne doit pas
  //    chiffrer ce que la ligne d'à côté déclare absent.
  const lignes = etat.accepte ? suiviLignesCommande(etat) : [];
  if (!lignes.length) {
    return '<p class="cv-fiche-vide">' + (etat.accepte ? 'Aucune commande enregistrée.'
      : (etat.decline ? 'Aucune commande : le club ne participe pas.'
        : 'Aucune commande : le club n’a pas encore répondu.')) + '</p>';
  }
  return '<dl class="cv-fiche-commande">' + lignes.map(function (l) {
    const detail = l.prix > 0
      ? ' <span class="cv-fiche-detail">(' + l.quantite + (l.unite ? ' ' + echapper(l.unite) : '') +
        ' × ' + echapper(suiviEuros(l.prix)) + ')</span>'
      : (l.quantite ? ' <span class="cv-fiche-detail">(' + l.quantite + ')</span>' : '');
    return '<div class="cv-fiche-ligne"><dt>' + echapper(l.libelle) + detail + '</dt>' +
      '<dd>' + echapper(suiviEuros(l.montant)) + '</dd></div>';
  }).join('') +
    '<div class="cv-fiche-ligne cv-fiche-total"><dt>Total</dt><dd>' +
    echapper(suiviEuros(etat.commande.total)) + '</dd></div></dl>';
}

/** « disabled aria-busy » tant que ce geste est en vol pour ce club — même après un repeint du tableau ou de la fiche. */
function suiviAttributsOccupe(type, nom) {
  return typeof suiviGesteEnCours === 'function' && suiviGesteEnCours(type, nom) ? ' disabled aria-busy="true"' : '';
}

/**
 * Les actions d'un club. `opt.sansPaiement` retire la paire « Marquer payé / Relancer le
 * paiement » : la fiche la montre déjà en tête, on ne la répète pas dans le dépliant.
 */
function suiviActionsHtml(club, etat, opt) {
  const options = opt || {};
  const nom = echapper(String(club.club_nom || ''));
  const actions = [];
  // ⭐ Un envoi en vol garde son bouton occupé, même quand le tableau et la fiche sont redessinés.
  const occupe = function (type) { return suiviAttributsOccupe(type, club.club_nom); };
  if (etat.attente) {
    const libelle = club.invitation_envoyee ? 'Relancer la réponse' : 'Envoyer l’invitation';
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="relance-reponse" data-club="' +
      nom + '"' + occupe('relance-reponse') + '>' + (occupe('relance-reponse') ? 'Envoi…' : libelle) + '</button>' +
      (club.derniere_relance_reponse ? '<small>Dernière relance : ' + echapper(suiviDate(club.derniere_relance_reponse)) + '</small>' : ''));
  }
  if (etat.confirmationAttendue) {
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="renvoyer-confirmation" data-club="' +
      nom + '"' + occupe('renvoyer-confirmation') + '>' + (occupe('renvoyer-confirmation') ? 'Envoi…' : 'Renvoyer la confirmation') + '</button>');
  }
  if (etat.paiementAttendu && !options.sansPaiement) {
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="relance-paiement" data-club="' +
      nom + '"' + occupe('relance-paiement') + '>' + (occupe('relance-paiement') ? 'Envoi…' : 'Relancer le paiement') + '</button>' +
      '<button type="button" class="bouton suivi-action" data-action="marquer-paye" data-club="' + nom + '"' + occupe('marquer-paye') +
      '>Marquer payé</button>' +
      (club.derniere_relance_paiement ? '<small>Dernière relance : ' + echapper(suiviDate(club.derniere_relance_paiement)) + '</small>' : ''));
  }
  if (etat.paye) {
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="marquer-a-payer" data-club="' +
      nom + '"' + occupe('marquer-a-payer') + '>Corriger le paiement</button>');
  }
  if (etat.accepte || etat.dossierDisponible) {
    const dossierEnvoye = String(club.dossier_envoye || '').trim();
    actions.push('<button type="button" class="bouton suivi-action" data-action="envoyer-dossier" data-club="' + nom + '"' +
      (etat.dossierDisponible ? '' : ' disabled title="Ajoute d’abord les équipes au tournoi dans Clubs invités"') + '>' +
      (dossierEnvoye ? 'Renvoyer le dossier final' : 'Envoyer le dossier final') + '</button>' +
      (dossierEnvoye ? '<small>Dossier envoyé le ' + echapper(suiviDate(dossierEnvoye)) + '</small>'
        : '<small>' + (etat.dossierDisponible ? 'Dossier non envoyé' : 'Dossier bloqué : équipes à ajouter') + '</small>'));
  }
  return actions.length ? actions.join('') : '<span class="suivi-termine">À jour</span>';
}

/**
 * Le rappel du BLOCAGE du dossier final. ⭐ Hors du dépliant d'actions, volontairement : c'est
 * l'explication d'un bouton grisé. La cacher derrière un second clic, c'est laisser
 * l'organisateur devant un dossier qu'il ne peut pas envoyer sans lui dire pourquoi.
 */
function suiviHtmlRappelEquipes(etat) {
  if (!etat.accepte || etat.dossierDisponible) return '';
  return '<div class="suivi-rappel-equipes" role="note"><strong>Équipes à ajouter au tournoi</strong>' +
    '<span>Dans Clubs invités, clique sur « Ajouter les équipes au tournoi » pour débloquer l’envoi du dossier final.</span></div>';
}

/** La fiche complète d'un club : réponse, commande chiffrée, paiement, puis les actions. */
function suiviHtmlFiche(club) {
  if (!club) {
    return '<p class="cv-fiche-vide" data-role="fiche-vide">Choisissez un club dans le tableau pour ' +
      'voir sa réponse, sa commande et son paiement.</p>';
  }
  const etat = suiviClubEtat(club);
  const nom = String(club.club_nom || 'Club sans nom');
  const effectifs = suiviClubEffectifs(club);
  const effectifsTexte = etat.accepte
    ? [effectifs.joueurs + ' joueur' + (effectifs.joueurs > 1 ? 's' : ''),
       effectifs.educateurs + ' éducateur' + (effectifs.educateurs > 1 ? 's' : '')].join(' · ')
    : (String(club.club_contact_email || '').trim() || 'Aucun email');
  const paiement = suiviEtatPaiement(etat);
  const notePaiement = etat.paye
    ? 'Paiement enregistré' + (club.date_paiement ? ' le ' + suiviDate(club.date_paiement) : '') + '.'
    : (etat.paiementAttendu ? 'Aucune preuve de paiement enregistrée.'
      : (etat.accepte ? 'Rien à régler pour ce club.'
        : (etat.decline ? 'Le club ne participe pas.' : 'Le club n’a pas encore répondu.')));
  // ⭐ Lot « Suivi des clubs » : les deux boutons de tête de la fiche disent aussi qu'un geste est en vol (désactivés,
  //   aria-busy, libellé) — ils restaient « Marquer payé » / « Relancer le paiement » cliquables pendant 30 à 90 s.
  const occupeFiche = function (type) { return typeof suiviGesteEnCours === 'function' && suiviGesteEnCours(type, nom); };
  const boutonsPaiement = etat.paiementAttendu
    ? '<div class="cv-fiche-actions">' +
      '<button type="button" class="bouton suivi-action" data-action="marquer-paye" data-club="' + echapper(nom) + '"' +
        suiviAttributsOccupe('marquer-paye', nom) + '>' + (occupeFiche('marquer-paye') ? 'Enregistrement…' : 'Marquer payé') + '</button>' +
      '<button type="button" class="bouton bouton-doux suivi-action" data-action="relance-paiement" data-club="' + echapper(nom) + '"' +
        suiviAttributsOccupe('relance-paiement', nom) + '>' + (occupeFiche('relance-paiement') ? 'Envoi…' : 'Relancer le paiement') + '</button>' +
      '</div>'
    : '';
  const resteAFaire = suiviActionsHtml(club, etat, { sansPaiement: true });
  return '<div class="cv-fiche-entete">' +
      '<span class="cv-fiche-avatar" aria-hidden="true">' + echapper(suiviInitiales(nom)) + '</span>' +
      '<div class="cv-fiche-titre"><h3 id="cv-fiche-nom" tabindex="-1">' + echapper(nom) + '</h3>' +
        '<small>' + echapper(effectifsTexte) + '</small></div>' +
      '<button type="button" class="cv-fiche-fermer bouton-lien" data-action="fermer-fiche" ' +
        'aria-label="Fermer la fiche de ' + echapper(nom) + '">×</button>' +
    '</div>' +
    '<section class="cv-fiche-section"><h4>Réponse</h4>' + suiviBadgeReponse(club, etat) + '</section>' +
    '<section class="cv-fiche-section"><h4>Commandes</h4>' + suiviHtmlLignesCommande(etat) + '</section>' +
    '<section class="cv-fiche-section"><h4>Paiement <span class="suivi-badge est-' + paiement.cle + '">' +
      echapper(paiement.libelle) + '</span></h4>' +
      '<p class="cv-fiche-note">' + echapper(notePaiement) + '</p>' + boutonsPaiement + '</section>' +
    suiviHtmlRappelEquipes(etat) +
    '<section class="cv-fiche-section cv-fiche-suite"><h4>Actions</h4>' +
      '<button type="button" class="bouton-lien cv-fiche-plus" data-action="fiche-complete" ' +
        'aria-expanded="' + (suiviFicheDepliee ? 'true' : 'false') + '" aria-controls="cv-fiche-reste">' +
        (suiviFicheDepliee ? 'Replier la fiche' : 'Ouvrir la fiche complète') + '</button>' +
      '<div class="suivi-club-actions" id="cv-fiche-reste"' + (suiviFicheDepliee ? '' : ' hidden') + '>' +
        resteAFaire + '</div>' +
    '</section>';
}

/** Peint la SEULE fiche latérale. Appelée à chaque sélection : le tableau n'est pas retouché. */
function afficherFicheClub() {
  const fiche = document.getElementById('cv-fiche-club');
  if (!fiche) return;
  const club = (clubsInvitesCourants || []).find(function (c) {
    return memeTexteSouple(c.club_nom, suiviClubSelectionne);
  });
  if (!club) suiviClubSelectionne = '';
  fiche.innerHTML = suiviHtmlFiche(club || null);
  fiche.classList.toggle('est-vide', !club);
}

/** Sélectionne un club : bascule le repère des lignes et repeint la fiche. Aucune requête. */
function suiviSelectionnerClub(nom) {
  const change = !memeTexteSouple(nom, suiviClubSelectionne);
  suiviClubSelectionne = String(nom || '');
  if (change) suiviFicheDepliee = false;
  document.querySelectorAll('#liste-suivi-clubs .suivi-club-ligne').forEach(function (ligne) {
    const actif = memeTexteSouple(ligne.getAttribute('data-club'), suiviClubSelectionne);
    ligne.classList.toggle('est-selectionne', actif);
    const bouton = ligne.querySelector('.suivi-ouvrir');
    if (bouton) bouton.setAttribute('aria-expanded', actif ? 'true' : 'false');
  });
  afficherFicheClub();
  const titre = document.getElementById('cv-fiche-nom');
  if (titre && typeof titre.focus === 'function') titre.focus();
}

/** Les compteurs de tête. Cliquables : ce sont les mêmes filtres que la barre d'onglets. */
function suiviHtmlResume(compte) {
  return [
    ['Réponses attendues', compte.attente, 'attente'], ['Participants', compte.oui, 'oui'],
    ['Ne participent pas', compte.non, 'non'], ['Paiements attendus', compte.paiement, 'paiement']
  ].map(function (x) {
    // ⚠️ `aria-label` OBLIGATOIRE : sans lui, le nom accessible colle le chiffre au libellé
    //    (« 1Réponses attendues »), les deux nœuds étant collés dans le HTML.
    return '<button type="button" class="suivi-indicateur ' + (suiviClubsFiltre === x[2] ? 'est-actif' : '') +
      '" data-filtre="' + x[2] + '" aria-pressed="' + (suiviClubsFiltre === x[2] ? 'true' : 'false') +
      '" aria-label="' + x[1] + ' ' + echapper(x[0].toLocaleLowerCase('fr')) + '">' +
      '<strong>' + x[1] + '</strong><span>' + x[0] + '</span></button>';
  }).join('');
}

/** La barre de filtres. Chaque onglet porte son compte : on sait avant de cliquer. */
function suiviHtmlFiltres(compte) {
  return [
    ['tous', 'Tous', compte.tous], ['attente', 'À relancer', compte.attente],
    ['oui', 'Oui', compte.oui], ['non', 'Non', compte.non], ['paiement', 'Paiements', compte.paiement]
  ].map(function (x) {
    const actif = suiviClubsFiltre === x[0];
    return '<button type="button" class="suivi-filtre ' + (actif ? 'est-actif' : '') +
      '" data-filtre="' + x[0] + '" aria-pressed="' + (actif ? 'true' : 'false') +
      '" aria-label="' + echapper(x[1]) + ' — ' + x[2] + ' club' + (x[2] > 1 ? 's' : '') + '">' + x[1] +
      '<span class="suivi-filtre-compte">' + x[2] + '</span></button>';
  }).join('');
}

/** Le tableau : une ligne par club, un état par colonne, et « Ouvrir » vers la fiche. */
function suiviHtmlTableau(affiches) {
  const colonnes = ['Club', 'Réponse', 'Repas', 'Goûters', 'Montant', 'Paiement', 'Action'];
  return '<div class="suivi-clubs-table" role="table" aria-label="Suivi des clubs">' +
    '<div class="suivi-clubs-entete" role="row">' +
      colonnes.map(function (c) { return '<span role="columnheader">' + c + '</span>'; }).join('') +
    '</div>' +
    affiches.map(function (club) {
      const e = suiviClubEtat(club);
      const nom = String(club.club_nom || 'Club sans nom');
      const repas = suiviQuantitePrestation('repas', e);
      const gouter = suiviQuantitePrestation('gouter', e);
      const paiement = suiviEtatPaiement(e);
      const montant = e.accepte && e.commande.total > 0 ? suiviEuros(e.commande.total) : '—';
      const choisi = memeTexteSouple(nom, suiviClubSelectionne);
      return '<article class="suivi-club-ligne club-etat-' + e.inscription + (choisi ? ' est-selectionne' : '') +
          '" data-club="' + echapper(nom) + '" role="row">' +
        '<div class="suivi-club-identite" role="cell">' +
          '<span class="suivi-avatar" aria-hidden="true">' + echapper(suiviInitiales(nom)) + '</span>' +
          '<span class="suivi-club-nom"><strong>' + echapper(nom) + '</strong>' +
            '<span class="suivi-badge etat-' + e.inscription + '">' + LIBELLES_ETAT_CLUB[e.inscription] + '</span>' +
          '</span></div>' +
        '<div class="suivi-cellule" role="cell" data-label="Réponse">' + suiviPastilleReponse(e) + '</div>' +
        '<div class="suivi-cellule suivi-nombre" role="cell" data-label="Repas" title="' + echapper(repas.titre) + '">' +
          echapper(repas.texte) + '</div>' +
        '<div class="suivi-cellule suivi-nombre" role="cell" data-label="Goûters" title="' + echapper(gouter.titre) + '">' +
          echapper(gouter.texte) + '</div>' +
        '<div class="suivi-cellule suivi-nombre" role="cell" data-label="Montant">' + echapper(montant) + '</div>' +
        '<div class="suivi-cellule" role="cell" data-label="Paiement">' +
          '<span class="suivi-badge est-' + paiement.cle + '">' + echapper(paiement.libelle) + '</span></div>' +
        '<div class="suivi-cellule suivi-club-ouvrir" role="cell" data-label="Action">' +
          '<button type="button" class="bouton-lien suivi-ouvrir" data-action="ouvrir-fiche" data-club="' + echapper(nom) +
            '" aria-label="Ouvrir la fiche de ' + echapper(nom) +
            '" aria-controls="cv-fiche-club" aria-expanded="' + (choisi ? 'true' : 'false') + '">Ouvrir' +
            '<span class="suivi-chevron" aria-hidden="true">›</span></button></div>' +
      '</article>';
    }).join('') + '</div>';
}

/* ============================================================================
 *  LOT « SUIVI DES CLUBS » — ÉTAT DE LA LISTE ET FOCUS
 * ============================================================================
 *  ⛔ Deux faux états relevés (Chromium, vrai Code.gs) : pendant la première lecture, « Connecte-toi pour charger le
 *  suivi. » à un organisateur connecté ; après une lecture en échec, « 0 réponse attendue… Aucun club dans ce filtre. »
 *  — un tournoi vide, alors que l'erreur n'était écrite que dans « Inviter un club ». L'écran dit désormais ce qui se
 *  passe : chargement, échec (avec « Réessayer »), ou dernier état connu quand une relecture échoue.
 *  ⛔ Focus : chaque repeint remplace les boutons ; celui qui avait le focus disparaissait (le clavier retombait sur la
 *  page) — après un filtre, un geste, ou un repeint venu d'ailleurs. Le repère est pris AVANT, rendu APRÈS, et jamais
 *  volé à un élément qui l'a encore.
 * ========================================================================== */
let suiviRelectureEnCours = false;
/* Le bouton d'où part un geste serveur : le focus y revient quand la confirmation (dialog.js, commun) ou la fenêtre du
 * dossier l'a laissé tomber sur la page. `repli` : l'élément de secours où on l'a posé pendant que le bouton était occupé. */
let suiviFocusGeste = null;
const SUIVI_ZONES_FOCUS = ['suivi-clubs-resume', 'suivi-clubs-filtres', 'liste-suivi-clubs', 'cv-fiche-club'];

/** L'état de la liste montrée : `connue` (lue, ou posée par une réponse), `enCours`, `erreur`. Module d'invitation
 *  d'avant (cache mêlé) : liste tenue pour connue, comme avant. */
function suiviEtatListe() {
  const lecture = (typeof etatLectureClubs === 'object' && etatLectureClubs) ? etatLectureClubs : null;
  if (!lecture) return { connue: true, enCours: false, erreur: '' };
  const chargee = typeof ressourceAdminChargee === 'function' && ressourceAdminChargee('clubsInvites');
  return {
    connue: lecture.lue || chargee || (clubsInvitesCourants || []).length > 0,
    enCours: !!lecture.enCours || suiviRelectureEnCours,
    erreur: chargee ? '' : String(lecture.erreur || '')
  };
}

/** Le HTML d'un état sans tableau (chargement, échec, déconnecté). */
function suiviHtmlEtatListe(etat) {
  if (typeof adminConnecte !== 'undefined' && !adminConnecte) return '<p class="vide">Connecte-toi pour charger le suivi.</p>';
  if (etat.enCours || !etat.erreur) return '<p class="vide" role="status">Chargement du suivi des clubs…</p>';
  return '<div class="vide suivi-etat-lecture" role="alert"><p>⚠️ Impossible de charger le suivi des clubs (' + echapper(etat.erreur) +
    '). Aucun chiffre n’est affiché tant que la liste n’est pas lue.</p>' +
    '<button type="button" class="bouton bouton-doux" data-action="relire-suivi">Réessayer</button></div>';
}

/** Relit la liste des clubs (bouton « Réessayer ») : une lecture à la fois, l'écran suit. */
function suiviRelire() {
  if (suiviRelectureEnCours || typeof rafraichirRessourceAdmin !== 'function') return Promise.resolve(false);
  suiviRelectureEnCours = true;
  const lecture = rafraichirRessourceAdmin('clubsInvites');
  afficherSuiviClubs();
  return Promise.resolve(lecture).then(function (ok) { return ok; }, function () { return false; }).then(function (ok) {
    suiviRelectureEnCours = false;
    afficherSuiviClubs();
    return ok;
  });
}

/** Le repère du contrôle qui a le focus (ou de `element`), s'il est dans le Suivi : sa zone et ce qui l'identifie. */
function suiviRepereFocus(element) {
  const el = element === undefined ? document.activeElement : element;
  if (!el || el === document.body || typeof el.getAttribute !== 'function') return null;
  for (let i = 0; i < SUIVI_ZONES_FOCUS.length; i++) {
    const zone = document.getElementById(SUIVI_ZONES_FOCUS[i]);
    if (zone && zone !== el && typeof zone.contains === 'function' && zone.contains(el)) {
      return { zone: SUIVI_ZONES_FOCUS[i], id: el.id || '', filtre: el.getAttribute('data-filtre'),
        action: el.getAttribute('data-action'), club: el.getAttribute('data-club') };
    }
  }
  return null;
}

/** Le focus est-il perdu (page, élément retiré) ? Un élément encore en place le garde : on ne le vole jamais. */
function suiviFocusPerdu() {
  const actif = document.activeElement;
  return !actif || actif === document.body || actif.isConnected === false;
}

/**
 * Rend le focus au contrôle équivalent du repère, sinon à un repli sûr de sa zone (titre de la fiche, filtre actif).
 * Un bouton occupé (désactivé) ne peut pas recevoir le focus : repli. @return {string|null} 'exact' | 'repli' | null
 */
function suiviRendreFocus(repere, forcer) {
  if (!repere || (!forcer && !suiviFocusPerdu())) return null;
  const zone = document.getElementById(repere.zone);
  if (!zone) return null;
  const pareil = function (e) {
    if (repere.id) return e.id === repere.id;
    return e.getAttribute('data-filtre') === repere.filtre && e.getAttribute('data-action') === repere.action &&
      e.getAttribute('data-club') === repere.club;
  };
  const cible = Array.prototype.filter.call(zone.querySelectorAll('button, input, [tabindex]'), pareil)
    .filter(function (e) { return !e.disabled && !e.hidden; })[0];
  if (cible && typeof cible.focus === 'function') { cible.focus(); return 'exact'; }
  let repli = null;
  if (repere.zone === 'cv-fiche-club') repli = document.getElementById('cv-fiche-nom');
  else if (repere.zone === 'liste-suivi-clubs') {
    repli = Array.prototype.filter.call(zone.querySelectorAll('[data-action="ouvrir-fiche"]'), function (e) {
      return e.getAttribute('data-club') === repere.club; })[0] || document.querySelector('#suivi-clubs-filtres .est-actif');
  } else repli = document.querySelector('#' + repere.zone + ' .est-actif') || document.querySelector('#suivi-clubs-filtres .est-actif');
  if (repli && typeof repli.focus === 'function') { repli.focus(); return 'repli'; }
  return null;
}

/** Fin d'un geste lancé depuis le Suivi : si le focus est perdu, ou resté sur le repli posé pendant l'envoi, il revient
 *  au bouton d'origine (redevenu actif) ; sinon on n'y touche pas. */
function suiviTerminerFocusGeste(geste) {
  if (!geste || suiviFocusGeste !== geste) return;
  suiviFocusGeste = null;
  const ici = suiviRepereFocus();
  const surRepli = !!(geste.repli && ici && JSON.stringify(ici) === JSON.stringify(geste.repli));
  if (suiviFocusPerdu() || surRepli) suiviRendreFocus(geste.repere, true);
}

function afficherSuiviClubs() {
  const resume = document.getElementById('suivi-clubs-resume');
  const filtres = document.getElementById('suivi-clubs-filtres');
  const liste = document.getElementById('liste-suivi-clubs');
  if (!resume || !filtres || !liste) return;
  const repere = suiviRepereFocus();                                  // pris AVANT de remplacer les boutons
  const etatListe = suiviEtatListe();
  if (!etatListe.connue) {
    resume.innerHTML = ''; filtres.innerHTML = '';
    liste.innerHTML = suiviHtmlEtatListe(etatListe);
    suiviClubSelectionne = ''; suiviFicheDepliee = false;
    afficherFicheClub();
    if (typeof actualiserRecherchesCiel === 'function') actualiserRecherchesCiel();
    suiviRendreFocusApresRepeint(repere);
    return;
  }
  const clubs = (clubsInvitesCourants || []).slice();
  const compte = { tous: clubs.length, attente: 0, oui: 0, non: 0, paiement: 0 };
  clubs.forEach(function (club) {
    const e = suiviClubEtat(club);
    if (e.attente) compte.attente++;
    if (e.accepte) compte.oui++;
    if (e.decline) compte.non++;
    if (e.paiementAttendu) compte.paiement++;
  });
  resume.innerHTML = suiviHtmlResume(compte);
  filtres.innerHTML = suiviHtmlFiltres(compte);

  const affiches = clubs.filter(function (club) { return suiviCorrespondFiltre(suiviClubEtat(club)); })
    .sort(function (a, b) {
      return suiviRangClub(a) - suiviRangClub(b) || String(a.club_nom || '').localeCompare(String(b.club_nom || ''), 'fr');
    });
  // La fiche suit la liste : un club sorti du filtre ne doit pas rester ouvert à côté d'un
  // tableau qui ne le montre plus.
  if (suiviClubSelectionne && !affiches.some(function (c) { return memeTexteSouple(c.club_nom, suiviClubSelectionne); })) {
    suiviClubSelectionne = '';
    suiviFicheDepliee = false;
  }
  // Relecture en échec APRÈS une première lecture réussie : le tableau garde le dernier état connu, et le dit.
  const avertissement = etatListe.erreur && !etatListe.enCours
    ? '<div class="suivi-etat-lecture" role="alert"><p>⚠️ La liste des clubs n’a pas pu être relue (' + echapper(etatListe.erreur) +
      ') : le suivi montre le dernier état connu.</p><button type="button" class="bouton bouton-doux" data-action="relire-suivi">Réessayer</button></div>'
    : '';
  liste.innerHTML = avertissement + (affiches.length
    ? suiviHtmlTableau(affiches)
    : '<p class="vide">Aucun club dans ce filtre.</p>');
  afficherFicheClub();
  if(typeof actualiserRecherchesCiel==='function')actualiserRecherchesCiel();
  suiviRendreFocusApresRepeint(repere);
}

/** Focus après un repeint : d'abord celui qu'avait l'écran ; à défaut (confirmation fermée : focus tombé sur la page), le
 *  bouton d'où est parti le geste en cours. ⛔ Jamais sans geste de l'organisateur, jamais volé à un élément vivant. */
function suiviRendreFocusApresRepeint(repere) {
  const geste = suiviFocusGeste;
  let rendu = suiviRendreFocus(repere);
  if (!repere && geste) rendu = suiviRendreFocus(geste.repere);
  // Posé sur un repli pendant qu'un geste est en vol (bouton occupé) : la fin du geste le ramènera au bouton d'origine.
  if (geste && rendu === 'repli') geste.repli = suiviRepereFocus();
  else if (geste && !repere && rendu === 'exact' && !geste.suivi) suiviFocusGeste = null;   // geste sans fin connue (dossier)
}

/* ⭐ Gestes du suivi qui écrivent (lot « Inviter un club », 2ᵉ passage) : même règle que l'écran « Inviter un club » —
   délai borné, un envoi à la fois par club et par geste (le bouton reste occupé même si le tableau est redessiné),
   issue incertaine dite « non confirmée », jamais renvoyée, suivie d'une relecture des clubs. */
const suiviGestesEnCours = new Set();
const suiviGestesIncertains = new Set();
function suiviCleGeste(type, nom) { return type + '|' + String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
function suiviGesteEnCours(type, nom) {
  if (type === 'relance-reponse') return typeof envoiEnCours === 'function' && envoiEnCours('invitation', nom);
  return suiviGestesEnCours.has(suiviCleGeste(type, nom));
}
function suiviEcrire(action, data) {
  return typeof ecrireInvitation === 'function' ? ecrireInvitation(action, data) : ecrireAdmin(action, data);
}
/** Un e-mail du suivi (5ᵉ passage) : identifiant du geste, repris après une issue incertaine (le serveur répond alors « déjà
 *  envoyé »), et confirmation explicite d'un renvoi retenu par le serveur. Module d'invitation d'avant : comme avant. */
function suiviEcrireEmail(action, data, type, nom) {
  const cle = suiviCleGeste(type, nom);
  if (typeof ecrireEnvoiEmail !== 'function') return suiviEcrire(action, data);
  return ecrireEnvoiEmail(action, data, { cle: cle, incertain: suiviGestesIncertains.has(cle) });
}
function suiviIssueIncertaine(erreur) {
  if (typeof issueIncertaine === 'function') return issueIncertaine(erreur);
  return !(erreur && erreur.reponse && typeof erreur.reponse === 'object') && !/^Action annulée/.test(String((erreur && erreur.message) || ''));
}
function suiviMessageIncertain(quoi, erreur) {
  if (typeof messageIncertain === 'function') return messageIncertain(quoi, erreur, 'le suivi est relu');
  return '⚠️ Réponse du serveur non reçue : ' + quoi + '. Rien n’est renvoyé automatiquement ; le suivi est relu.';
}

/** Le résultat d'un geste réussi : sur le club trouvé au clic ET sur celui de la liste courante — remplacée pendant l'envoi,
 *  elle aurait gardé l'état d'avant (lot « Suivi des clubs », `appliquerAuClubInvite`). Module d'invitation d'avant : comme avant. */
function suiviAppliquerAuClub(club, nom, champs) {
  Object.assign(club, champs);
  if (typeof appliquerAuClubInvite === 'function') appliquerAuClubInvite(nom, champs, afficherSuiviClubs);
}

/** Un geste du suivi : garde « un à la fois », état occupé, écriture bornée, issue incertaine relue. */
async function suiviExecuterGeste(type, nom, confirmer, ecrire, reussite, quoiIncertain) {
  const cle = suiviCleGeste(type, nom);
  if (suiviGestesEnCours.has(cle)) return;                      // ⛔ double clic : rien de plus
  suiviGestesEnCours.add(cle);
  const message = document.getElementById('message-suivi-clubs');
  try {
    const avertissement = suiviGestesIncertains.has(cle)
      ? '\n\n⚠️ Le geste précédent n’a pas été confirmé : il a peut-être déjà eu lieu.' : '';
    if (!await confirmer(avertissement)) return;
    afficherSuiviClubs();                                          // le bouton passe « occupé »
    let res;
    try { res = await ecrire(); }
    catch (erreur) {
      if (!suiviIssueIncertaine(erreur)) {
        if (typeof oublierIdEnvoi === 'function') oublierIdEnvoi(cle);
        afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
        return;
      }
      suiviGestesIncertains.add(cle);                               // l'identifiant d'un e-mail est gardé pour la reprise
      afficherMessage(message, suiviMessageIncertain(quoiIncertain, erreur), 'ko');
      if (typeof rafraichirRessourceAdmin === 'function') rafraichirRessourceAdmin('clubsInvites');
      return;
    }
    suiviGestesIncertains.delete(cle);
    if (typeof oublierIdEnvoi === 'function') oublierIdEnvoi(cle);
    reussite(res, message);
  } finally {
    suiviGestesEnCours.delete(cle);
    afficherSuiviClubs();
  }
}

async function suiviMarquerPaiement(nom, paye) {
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const question = paye ? 'Confirmer la réception du paiement de « ' + nom + ' » ?'
    : 'Retirer la marque « payé » pour « ' + nom + ' » ?';
  return suiviExecuterGeste(paye ? 'marquer-paye' : 'marquer-a-payer', nom,
    function (avert) { return dialogConfirmer(question + avert, { ok: paye ? 'Marquer payé' : 'Corriger' }); },
    function () { return suiviEcrire('enregistrerPaiementClub', { club_nom: nom, statut: paye ? 'paye' : 'a_payer' }); },
    function (res, message) {
      suiviAppliquerAuClub(club, nom, { paiement_statut: res.paiement_statut || '', date_paiement: res.date_paiement || '' });
      afficherMessage(message, paye ? '✅ Paiement enregistré.' : '✅ Paiement remis à « À payer ».', 'ok');
    }, 'le paiement de « ' + nom + ' » n’est pas confirmé');
}

async function suiviRelancerPaiement(nom) {
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const email = String(club.club_contact_email || '').trim();
  const total = suiviClubCommande(club).total;
  return suiviExecuterGeste('relance-paiement', nom,
    function (avert) {
      return dialogConfirmer('Envoyer un rappel de paiement de ' + suiviEuros(total) + ' à « ' + nom +
        ' » (' + email + ') ?' + avert, { ok: 'Envoyer la relance' });
    },
    function () { return suiviEcrireEmail('relancerPaiementClub', { club_nom: nom }, 'relance-paiement', nom); },
    function (res, message) {
      suiviAppliquerAuClub(club, nom, { derniere_relance_paiement: res.derniere_relance_paiement || '' });
      afficherMessage(message, res.rejeu ? '✅ Relance de paiement déjà partie vers ' + email + ' (la réponse précédente s’était perdue) : ' +
        'rien n’a été renvoyé.' : '✅ Relance de paiement envoyée à ' + email + '.', 'ok');
    }, 'la relance de paiement à ' + email + ' n’est pas confirmée — le club l’a peut-être reçue');
}

async function suiviRenvoyerConfirmation(nom) {
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const email = String(club.club_contact_email || '').trim();
  return suiviExecuterGeste('renvoyer-confirmation', nom,
    function (avert) {
      return dialogConfirmer('Renvoyer l’e-mail de confirmation à « ' + nom + ' » (' + email + ') ?' + avert,
        { ok: 'Renvoyer la confirmation' });
    },
    function () { return suiviEcrireEmail('renvoyerConfirmationReponseClub', { club_nom: nom }, 'renvoyer-confirmation', nom); },
    function (res, message) {
      suiviAppliquerAuClub(club, nom, { confirmation_reponse_envoyee: res.confirmation_reponse_envoyee || '',
        confirmation_reponse_erreur: res.confirmation_reponse_erreur || '' });
      afficherMessage(message, res.rejeu ? '✅ Confirmation déjà partie vers ' + email + ' (la réponse précédente s’était perdue) : ' +
        'rien n’a été renvoyé.' : '✅ Confirmation renvoyée à ' + email + '.', 'ok');
    }, 'le renvoi de la confirmation à ' + email + ' n’est pas confirmé — le club l’a peut-être reçue');
}

document.addEventListener('click', function (event) {
  if (event.target.closest('#bouton-pdf-suivi-restauration')) {
    event.preventDefault();
    onTelechargerPdfSuiviRestauration();
    return;
  }
  const filtre = event.target.closest('[data-filtre]');
  if (filtre && (filtre.closest('#suivi-clubs-resume') || filtre.closest('#suivi-clubs-filtres'))) {
    suiviClubsFiltre = filtre.getAttribute('data-filtre') || 'tous';
    afficherSuiviClubs();
    return;
  }
  // Fermer la fiche et la déplier ne portent pas de club : elles agissent sur la sélection.
  const fiche = event.target.closest('#cv-fiche-club [data-action]');
  if (fiche) {
    const geste = fiche.getAttribute('data-action');
    if (geste === 'fermer-fiche') {
      const ligne = document.querySelector('#liste-suivi-clubs .suivi-club-ligne.est-selectionne .suivi-ouvrir');
      suiviSelectionnerClub('');
      if (ligne && typeof ligne.focus === 'function') ligne.focus(); // le focus revient d'où il venait
      return;
    }
    if (geste === 'fiche-complete') {
      suiviFicheDepliee = !suiviFicheDepliee;
      afficherFicheClub();
      const plus = document.querySelector('#cv-fiche-club .cv-fiche-plus');
      if (plus && typeof plus.focus === 'function') plus.focus();
      return;
    }
  }
  // « Réessayer » d'une lecture de la liste en échec (lot « Suivi des clubs »).
  const relire = event.target.closest('#liste-suivi-clubs [data-action="relire-suivi"]');
  if (relire) {
    if (relire.disabled || suiviRelectureEnCours) return;
    const retour = { repere: suiviRepereFocus(relire), repli: null, suivi: true };
    suiviFocusGeste = retour;
    suiviRelire().then(function () { suiviTerminerFocusGeste(retour); });
    return;
  }
  // ⭐ Les actions vivent dans les DEUX zones : le tableau (repli sans panneau latéral) et la
  //   fiche. Un seul contrat `data-action` + `data-club`, un seul aiguillage.
  const bouton = event.target.closest('#liste-suivi-clubs [data-action][data-club], #cv-fiche-club [data-action][data-club]');
  if (!bouton || bouton.disabled) return;
  const nom = bouton.getAttribute('data-club');
  const action = bouton.getAttribute('data-action');
  if (action === 'ouvrir-fiche') { suiviSelectionnerClub(nom); return; }
  // Un geste serveur : la confirmation (commune) laisse tomber le focus sur la page ; il reviendra à ce bouton.
  const repere = suiviRepereFocus(bouton);
  const dejaSuivi = suiviFocusGeste && JSON.stringify(suiviFocusGeste.repere) === JSON.stringify(repere);
  const geste = dejaSuivi ? null : { repere: repere, repli: null, suivi: action !== 'envoyer-dossier' };
  if (geste) suiviFocusGeste = geste;
  let fin = null;
  if (action === 'relance-reponse') fin = envoyerInvitationClubUI(nom, { relance: true });
  else if (action === 'relance-paiement') fin = suiviRelancerPaiement(nom);
  else if (action === 'renvoyer-confirmation') fin = suiviRenvoyerConfirmation(nom);
  else if (action === 'marquer-paye') fin = suiviMarquerPaiement(nom, true);
  else if (action === 'marquer-a-payer') fin = suiviMarquerPaiement(nom, false);
  else if (action === 'envoyer-dossier') genererDossierFinal(nom);   // fenêtre d'envoi : focus rendu au premier repeint utile
  if (geste && geste.suivi) Promise.resolve(fin).then(function () { suiviTerminerFocusGeste(geste); }, function () { suiviTerminerFocusGeste(geste); });
});
