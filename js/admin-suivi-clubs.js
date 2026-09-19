/**
 * Tableau de suivi des clubs : réponse, restauration, montant dû et règlement.
 * Les montants et quantités viennent du récapitulatif figé lors de la réponse du club.
 */

let suiviClubsFiltre = 'tous';

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
  function prestation(nom) {
    const p = commande[nom] || {};
    return {
      joueurs: Math.max(0, Number(p.joueurs) || 0),
      educateurs: Math.max(0, Number(p.educateurs) || 0)
    };
  }
  const total = Number(String(commande.total == null ? '' : commande.total).replace(',', '.'));
  return { repas: prestation('repas'), gouter: prestation('gouter'),
    total: Number.isFinite(total) ? Math.max(0, total) : 0, inscription: commande.inscription || {},
    montantRepas: Number(commande.repas && commande.repas.sous_total || 0),
    montantGouter: Number(commande.gouter && commande.gouter.sous_total || 0) };
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

/** Données figées du PDF : aucun appel réseau et aucune écriture métier. */
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

function suiviBadgeReponse(club, etat) {
  const trace = club.confirmation_reponse_envoyee
    ? '<small>Confirmation envoyée le ' + echapper(suiviDate(club.confirmation_reponse_envoyee)) + '</small>'
    : ((etat.accepte || etat.decline) ? '<small class="suivi-confirmation-a-renvoyer">Confirmation à renvoyer</small>' : '');
  if (etat.accepte) return '<span class="suivi-badge est-oui">Oui</span>' +
    (club.date_reponse ? '<small>le ' + echapper(suiviDate(club.date_reponse)) + '</small>' : '') + trace;
  if (etat.decline) return '<span class="suivi-badge est-non">Non</span>' +
    (club.date_reponse ? '<small>le ' + echapper(suiviDate(club.date_reponse)) + '</small>' : '') + trace;
  return '<span class="suivi-badge est-attente">En attente</span>' +
    (club.invitation_envoyee ? '<small>invitation envoyée le ' + echapper(suiviDate(club.invitation_envoyee)) + '</small>'
      : '<small>invitation non envoyée</small>');
}

function suiviPaiementHtml(club, etat) {
  if (!etat.accepte) return '<span class="suivi-badge est-neutre">—</span>';
  if (etat.commande.total <= 0) return '<span class="suivi-badge est-neutre">Rien à payer</span>';
  const c = etat.commande;
  const inscription = c.inscription;
  const parClub = inscription.mode === 'par_club';
  const nombre = parClub ? 1 : Number(inscription.nb_equipes || 0);
  const detail = '<small>Inscription : ' + echapper(suiviEuros(Number(inscription.sous_total || 0))) +
    ' (' + nombre + (parClub ? ' club' : ' équipe' + (nombre > 1 ? 's' : '')) +
    ' × ' + echapper(suiviEuros(Number(inscription.prix_unitaire || 0))) + ')</small>' +
    '<small>Repas : ' + echapper(suiviEuros(c.montantRepas)) + ' · Goûters : ' + echapper(suiviEuros(c.montantGouter)) + '</small>';
  if (etat.paye) return '<span class="suivi-badge est-paye">Payé</span><small>' + echapper(suiviEuros(c.total)) + '</small>' + detail +
    (club.date_paiement ? '<small>le ' + echapper(suiviDate(club.date_paiement)) + '</small>' : '');
  return '<span class="suivi-badge est-du">À payer</span><small>' + echapper(suiviEuros(c.total)) + '</small>' + detail;
}

function suiviActionsHtml(club, etat) {
  const nom = echapper(String(club.club_nom || ''));
  if (etat.attente) {
    const libelle = club.invitation_envoyee ? 'Relancer la réponse' : 'Envoyer l’invitation';
    return '<button type="button" class="bouton bouton-doux suivi-action" data-action="relance-reponse" data-club="' +
      nom + '">' + libelle + '</button>' +
      (club.derniere_relance_reponse ? '<small>Dernière relance : ' + echapper(suiviDate(club.derniere_relance_reponse)) + '</small>' : '');
  }
  const actions = [];
  if (etat.confirmationAttendue) {
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="renvoyer-confirmation" data-club="' +
      nom + '">Renvoyer la confirmation</button>');
  }
  if (etat.paiementAttendu) {
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="relance-paiement" data-club="' +
      nom + '">Relancer le paiement</button>' +
      '<button type="button" class="bouton suivi-action" data-action="marquer-paye" data-club="' + nom + '">Marquer payé</button>' +
      (club.derniere_relance_paiement ? '<small>Dernière relance : ' + echapper(suiviDate(club.derniere_relance_paiement)) + '</small>' : ''));
  }
  if (etat.paye) {
    actions.push('<button type="button" class="bouton bouton-doux suivi-action" data-action="marquer-a-payer" data-club="' +
      nom + '">Corriger le paiement</button>');
  }
  return actions.length ? actions.join('') : '<span class="suivi-termine">À jour</span>';
}

function afficherSuiviClubs() {
  const resume = document.getElementById('suivi-clubs-resume');
  const filtres = document.getElementById('suivi-clubs-filtres');
  const liste = document.getElementById('liste-suivi-clubs');
  if (!resume || !filtres || !liste) return;
  const clubs = (clubsInvitesCourants || []).slice();
  const compte = { attente: 0, oui: 0, non: 0, paiement: 0 };
  clubs.forEach(function (club) {
    const e = suiviClubEtat(club);
    if (e.attente) compte.attente++;
    if (e.accepte) compte.oui++;
    if (e.decline) compte.non++;
    if (e.paiementAttendu) compte.paiement++;
  });
  resume.innerHTML = [
    ['Réponses attendues', compte.attente, 'attente'], ['Participent', compte.oui, 'oui'],
    ['Ne participent pas', compte.non, 'non'], ['Paiements attendus', compte.paiement, 'paiement']
  ].map(function (x) {
    return '<button type="button" class="suivi-indicateur ' + (suiviClubsFiltre === x[2] ? 'est-actif' : '') +
      '" data-filtre="' + x[2] + '"><strong>' + x[1] + '</strong><span>' + x[0] + '</span></button>';
  }).join('');
  filtres.innerHTML = [
    ['tous', 'Tous'], ['attente', 'À relancer'], ['oui', 'Oui'], ['non', 'Non'], ['paiement', 'Paiements']
  ].map(function (x) {
    return '<button type="button" class="suivi-filtre ' + (suiviClubsFiltre === x[0] ? 'est-actif' : '') +
      '" data-filtre="' + x[0] + '">' + x[1] + '</button>';
  }).join('');

  const affiches = clubs.filter(function (club) { return suiviCorrespondFiltre(suiviClubEtat(club)); })
    .sort(function (a, b) {
      return suiviRangClub(a) - suiviRangClub(b) || String(a.club_nom || '').localeCompare(String(b.club_nom || ''), 'fr');
    });
  if (!affiches.length) {
    liste.innerHTML = '<p class="vide">Aucun club dans ce filtre.</p>';
    return;
  }
  liste.innerHTML = '<div class="suivi-clubs-entete"><span>Club</span><span>Réponse</span><span>Repas</span><span>Goûter</span><span>Paiement</span><span>Action</span></div>' +
    affiches.map(function (club) {
      const e = suiviClubEtat(club);
      return '<article class="suivi-club-ligne">' +
        '<div class="suivi-club-identite"><strong>' + echapper(club.club_nom || 'Club sans nom') + '</strong>' +
        '<small>' + echapper(club.club_contact_email || 'Aucun email') + '</small></div>' +
        '<div class="suivi-cellule" data-label="Réponse">' + suiviBadgeReponse(club, e) + '</div>' +
        '<div class="suivi-cellule" data-label="Repas"><span>' + echapper(suiviLibellePrestation('repas', e)) + '</span></div>' +
        '<div class="suivi-cellule" data-label="Goûter"><span>' + echapper(suiviLibellePrestation('gouter', e)) + '</span></div>' +
        '<div class="suivi-cellule" data-label="Paiement">' + suiviPaiementHtml(club, e) + '</div>' +
        '<div class="suivi-club-actions">' + suiviActionsHtml(club, e) + '</div></article>';
    }).join('');
}

async function suiviMarquerPaiement(nom, paye) {
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const message = document.getElementById('message-suivi-clubs');
  const question = paye ? 'Confirmer la réception du paiement de « ' + nom + ' » ?'
    : 'Retirer la marque « payé » pour « ' + nom + ' » ?';
  if (!await dialogConfirmer(question, { ok: paye ? 'Marquer payé' : 'Corriger' })) return;
  try {
    const res = await ecrireAdmin('enregistrerPaiementClub', {
      club_nom: nom, statut: paye ? 'paye' : 'a_payer'
    });
    club.paiement_statut = res.paiement_statut || '';
    club.date_paiement = res.date_paiement || '';
    afficherSuiviClubs();
    afficherMessage(message, paye ? '✅ Paiement enregistré.' : '✅ Paiement remis à « À payer ».', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  }
}

async function suiviRelancerPaiement(nom) {
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const message = document.getElementById('message-suivi-clubs');
  const email = String(club.club_contact_email || '').trim();
  const total = suiviClubCommande(club).total;
  if (!await dialogConfirmer('Envoyer un rappel de paiement de ' + suiviEuros(total) + ' à « ' + nom +
    ' » (' + email + ') ?', { ok: 'Envoyer la relance' })) return;
  try {
    const res = await ecrireAdmin('relancerPaiementClub', { club_nom: nom });
    club.derniere_relance_paiement = res.derniere_relance_paiement || '';
    afficherSuiviClubs();
    afficherMessage(message, '✅ Relance de paiement envoyée à ' + email + '.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  }
}

async function suiviRenvoyerConfirmation(nom) {
  const club = (clubsInvitesCourants || []).find(function (c) { return memeTexteSouple(c.club_nom, nom); });
  if (!club) return;
  const message = document.getElementById('message-suivi-clubs');
  const email = String(club.club_contact_email || '').trim();
  if (!await dialogConfirmer('Renvoyer l’e-mail de confirmation à « ' + nom + ' » (' + email + ') ?',
    { ok: 'Renvoyer la confirmation' })) return;
  try {
    const res = await ecrireAdmin('renvoyerConfirmationReponseClub', { club_nom: nom });
    club.confirmation_reponse_envoyee = res.confirmation_reponse_envoyee || '';
    club.confirmation_reponse_erreur = res.confirmation_reponse_erreur || '';
    afficherSuiviClubs();
    afficherMessage(message, '✅ Confirmation renvoyée à ' + email + '.', 'ok');
  } catch (erreur) {
    afficherMessage(message, '⚠️ ' + erreur.message, 'ko');
  }
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
  const bouton = event.target.closest('#liste-suivi-clubs [data-action][data-club]');
  if (!bouton) return;
  const nom = bouton.getAttribute('data-club');
  const action = bouton.getAttribute('data-action');
  if (action === 'relance-reponse') envoyerInvitationClubUI(nom, { relance: true });
  else if (action === 'relance-paiement') suiviRelancerPaiement(nom);
  else if (action === 'renvoyer-confirmation') suiviRenvoyerConfirmation(nom);
  else if (action === 'marquer-paye') suiviMarquerPaiement(nom, true);
  else if (action === 'marquer-a-payer') suiviMarquerPaiement(nom, false);
});
