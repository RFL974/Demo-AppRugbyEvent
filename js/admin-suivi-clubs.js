/**
 * Tableau de suivi des clubs : réponse, restauration, montant dû et règlement.
 * Les montants et quantités viennent du récapitulatif figé lors de la réponse du club.
 */

let suiviClubsFiltre = 'tous';

function suiviClubCommande(club) {
  let detail = {};
  try { detail = JSON.parse(String((club && club.detail_effectifs) || '{}')) || {}; } catch (e) { detail = {}; }
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
    total: Number.isFinite(total) ? Math.max(0, total) : 0 };
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
  if (etat.paye) return '<span class="suivi-badge est-paye">Payé</span>' +
    (club.date_paiement ? '<small>le ' + echapper(suiviDate(club.date_paiement)) + '</small>' : '');
  return '<span class="suivi-badge est-du">À payer</span><small>' + echapper(suiviEuros(etat.commande.total)) + '</small>';
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
