/**
 * ============================================================================
 *  RÉPONSE À L'INVITATION (Phase 1) — libre-service du club (Sprint 6)
 * ============================================================================
 *  Page PUBLIQUE sécurisée par un JETON (reponse-invitation.html?tournoi=…&club=…&token=…).
 *  Le contact du club répond lui-même : présent (catégories + nombre d'équipes + joueurs)
 *  ou absent. La réponse remplit automatiquement la fiche du club dans l'admin. L'envoi du
 *  dossier complet reste toujours déclenché MANUELLEMENT par l'organisateur (jamais ici).
 *
 *  Sécurité : toutes les données (lecture et écriture) sont validées côté backend par le
 *  jeton. Un jeton invalide → message générique « Lien invalide ou expiré » (rien n'est révélé).
 * ============================================================================
 */

let repDonnees = null;   // { club, tournoi, categories } renvoyé par le backend
let repParams = null;    // { tournoi, club, token } de l'URL

document.addEventListener('DOMContentLoaded', initReponse);

// txt, dateLongueFr, urlAffiche, jsonSur, parseCategoriesEngagees : voir commun-dossier.js.

async function initReponse() {
  const params = new URLSearchParams(window.location.search);
  repParams = { tournoi: txt(params.get('tournoi')), club: txt(params.get('club')), token: txt(params.get('token')) };
  const zone = document.getElementById('reponse');

  if (!repParams.token) { zone.innerHTML = messageErreur('Lien invalide ou expiré.'); return; }

  try {
    const res = await apiGet('getReponseInvitation', {
      tournoi: repParams.tournoi, club: repParams.club, token: repParams.token
    });
    if (!res || res.error || !res.club) { zone.innerHTML = messageErreur('Lien invalide ou expiré.'); return; }
    repDonnees = res;
    zone.innerHTML = construirePage(res);
    brancherEvenements();
  } catch (e) {
    // apiGet lève si le backend renvoie { error } (jeton invalide → « Lien invalide ou expiré. »)
    // OU en cas d'erreur réseau. Le message backend étant déjà générique, on l'affiche tel quel.
    zone.innerHTML = messageErreur((e && e.message) ? e.message : 'Lien invalide ou expiré.');
  }
}

/** Bloc d'erreur générique (ne révèle aucune information). */
function messageErreur(texte) {
  return '<div class="message-chargement erreur">' + echapper(texte) + '</div>';
}

/* --------------------------------------------------------------------------
   CONSTRUCTION DE LA PAGE
   -------------------------------------------------------------------------- */

function construirePage(data) {
  const t = data.tournoi || {};
  const club = data.club || {};
  const nom = txt(t.nom) || 'Le tournoi';
  const prenom = txt(club.club_contact_prenom);
  const dejaRepondu = !!txt(club.date_reponse);

  let html = '';

  // a) En-tête VITRINE (même principe que l'invitation refondue) : blason centré en grand,
  //    surtitre, grand titre, date · lieu, puis l'affiche en version COMPACTE (la page est un
  //    formulaire : l'affiche rappelle le tournoi sans repousser la réponse hors de l'écran).
  const quand = [];
  if (txt(t.date)) quand.push('<span class="inv-quand-date">' + echapper(dateLongueFr(t.date)) + '</span>');
  if (txt(t.lieu)) quand.push('<span>' + echapper(txt(t.lieu)) + '</span>');
  html += '<header class="inv-hero">' +
    '<img class="inv-blason" src="assets/logo-tournoi.svg" alt="" onerror="this.style.display=\'none\'">' +
    '<p class="inv-surtitre">Vous êtes invités</p>' +
    '<h1 class="inv-titre">' + echapper(nom) + '</h1>' +
    (quand.length ? '<p class="inv-quand">' + quand.join('<span class="inv-quand-sep"> · </span>') + '</p>' : '') +
  '</header>';
  if (txt(t.affiche_id)) {
    html += '<figure class="inv-affiche inv-affiche-compacte">' +
      '<img src="' + echapper(urlAffiche(t.affiche_id, 800)) + '" alt="Affiche — ' + echapper(nom) + '">' +
    '</figure>';
  }

  // GEL J-16 (décision Romain) : la page devient LECTURE SEULE — rappel de la réponse donnée,
  // mot d'explication et porte de sortie par email. Le vrai verrou d'écriture est côté serveur
  // (repondreInvitation) : cet écran informe, il ne protège pas.
  if (data.reponses_gelees) {
    html += '<p class="d-presentation">' + (prenom ? 'Bonjour ' + echapper(prenom) + ', ' : '') +
      'les inscriptions de cette journée sont désormais closes.</p>';
    if (dejaRepondu) {
      const st = txt(club.statut);
      html += '<p class="rep-deja">✅ Votre réponse du ' + echapper(dateLongueFr(club.date_reponse))
        + (st ? ' (' + echapper(st) + ')' : '') + ' est bien enregistrée.</p>';
    }
    const email = txt(data.contact_email);
    html += '<p class="rep-gel">🔒 Les réponses sont closes depuis J-16 : l\'organisation prépare ' +
      'les documents officiels de la journée à partir des effectifs déclarés. ' +
      (email
        ? 'Pour toute modification de dernière minute, écrivez à <a href="mailto:' + echapper(email) + '">'
          + echapper(email) + '</a>.'
        : 'Pour toute modification de dernière minute, contactez l\'organisateur.') + '</p>';
    html += '<footer class="d-pied"><span>L\'organisation du tournoi</span></footer>';
    return html;
  }

  html += '<p class="d-presentation">' + (prenom ? 'Bonjour ' + echapper(prenom) + ', ' : '')
    + 'merci de nous indiquer si votre club pourra participer à cette journée.</p>';

  // Rappel si le club a déjà répondu (il peut modifier sa réponse).
  if (dejaRepondu) {
    const statut = txt(club.statut);
    html += '<p class="rep-deja">✅ Vous avez déjà répondu le ' + echapper(dateLongueFr(club.date_reponse))
      + (statut ? ' (' + echapper(statut) + ')' : '') + '. Vous pouvez modifier votre réponse ci-dessous.</p>';
  }

  // b) Deux boutons initiaux.
  html += '<div class="rep-choix">' +
    '<button type="button" class="rep-btn rep-btn-oui" id="btn-present">✅ Nous serons présents</button>' +
    '<button type="button" class="rep-btn rep-btn-non" id="btn-absent">❌ Nous ne pourrons pas venir</button>' +
  '</div>';

  // Zone « présents » (formulaire) + zone « absents » (confirmation) + zone message final.
  html += '<div id="rep-zone-present" hidden>' + formulairePresence(data) + '</div>';
  html += '<div id="rep-zone-absent" hidden>' +
    '<p class="rep-question">Confirmez-vous que votre club ne pourra pas participer ?</p>' +
    '<div class="rep-choix">' +
      '<button type="button" class="rep-btn rep-btn-non" id="btn-decline-confirm">Oui, nous déclinons</button>' +
      '<button type="button" class="rep-btn rep-btn-neutre" id="btn-annuler">Annuler</button>' +
    '</div>' +
  '</div>';
  html += '<div id="rep-message-final"></div>';

  // Pied.
  html += '<footer class="d-pied"><span>L\'organisation du tournoi</span></footer>';
  return html;
}

/** Formulaire « Nous serons présents » : catégories + nb d'équipes + nb joueurs total. */
function formulairePresence(data) {
  const cats = (data.categories || []);
  const engagees = parseCategoriesEngagees(data.club.categories_engagees);
  const nbParCat = jsonSur(data.club.nb_equipes_par_categorie, {});
  detailInitial = jsonSur(data.club.detail_effectifs, {});

  let lignes = '';
  cats.forEach(function (c) {
    const nomCat = txt(c.categorie);
    const max = parseInt(txt(c.max_equipes_par_club), 10);
    const aMax = isFinite(max) && max >= 1;
    const coche = engagees.indexOf(nomCat.toUpperCase()) !== -1;
    const nbVal = (nbParCat && nbParCat[nomCat] != null) ? String(nbParCat[nomCat]) : '';
    const effMin = parseInt(txt(c.effectif_min), 10);
    const aEffMin = isFinite(effMin) && effMin >= 1;
    const infoEff = aEffMin ? (' · ' + effMin + ' joueurs mini/équipe') : '';
    lignes +=
      '<div class="rep-cat" data-cat="' + echapper(nomCat) + '"' + (aMax ? ' data-max="' + max + '"' : '') +
        (aEffMin ? ' data-effmin="' + effMin + '"' : '') + '>' +
        '<label class="rep-cat-titre"><input type="checkbox" class="rep-cat-case"' + (coche ? ' checked' : '') + '> ' +
          '<span class="rep-cat-nom">' + echapper(nomCat) + '</span>' +
          '<span class="rep-cat-info">' + (aMax ? 'jusqu\'à ' + max + ' équipe' + (max > 1 ? 's' : '') : 'plusieurs équipes possibles') + echapper(infoEff) + '</span>' +
        '</label>' +
        // Pas d'attribut HTML `max` : on gère la limite en JS (message custom clair) — l'attribut
        // natif bloquerait le submit sans laisser passer notre message. min="1" reste natif.
        '<span class="rep-cat-nb"' + (coche ? '' : ' hidden') + '>' +
          '<input type="number" class="rep-cat-equipes" min="1"' +
            ' value="' + echapper(nbVal || (coche ? '1' : '')) + '" inputmode="numeric"> équipe(s)' +
        '</span>' +
        '<span class="rep-cat-err" role="alert"></span>' +
        // Détail PAR ÉQUIPE (session 23) : joueurs + éducateurs de chaque équipe, rendu par
        // majDetailEquipes selon le nombre d'équipes saisi (valeurs préservées au re-rendu).
        '<div class="rep-cat-detail"' + (coche ? '' : ' hidden') + '></div>' +
      '</div>';
  });

  return '<form id="form-presence" class="rep-form">' +
    '<h2 class="rep-titre">Vos équipes engagées</h2>' +
    '<p class="rep-aide">Cochez les catégories concernées et indiquez le nombre d\'équipes pour chacune.</p>' +
    '<div class="rep-cats">' + (lignes || '<p class="rep-aide">Aucune catégorie ouverte pour le moment.</p>') + '</div>' +
    // Totaux VIVANTS (recalculés à chaque saisie) — remplacent l'ancien champ manuel global.
    '<div class="rep-totaux" id="rep-totaux" hidden>' +
      '<span>Total joueurs engagés : <strong id="rep-total-joueurs">0</strong></span>' +
      '<span>Total éducateurs : <strong id="rep-total-educateurs">0</strong></span>' +
    '</div>' +
    '<div class="rep-actions">' +
      '<button type="submit" class="rep-btn rep-btn-oui" id="btn-confirmer">Confirmer notre participation</button>' +
      '<span class="rep-form-msg" id="rep-form-msg"></span>' +
    '</div>' +
  '</form>';
}

/* --------------------------------------------------------------------------
   DÉTAIL PAR ÉQUIPE (session 23) — joueurs + éducateurs de chaque équipe
   -------------------------------------------------------------------------- */

/** Détail déjà déclaré par le club (ré-ouverture de la page), ou {}. */
let detailInitial = {};

/** (Re)rend les lignes « Équipe i : joueurs / éducateurs » d'une catégorie, en PRÉSERVANT les
 *  valeurs déjà saisies quand le nombre d'équipes change. `effMin` posé en min natif : le
 *  navigateur aide, et la validation JS donne le message clair. */
function majDetailEquipes(ligne) {
  const zone = ligne.querySelector('.rep-cat-detail');
  if (!zone) return;
  const nomCat = ligne.getAttribute('data-cat');
  const nb = parseInt(ligne.querySelector('.rep-cat-equipes').value, 10);
  if (!isFinite(nb) || nb < 1) { zone.innerHTML = ''; return; }
  // Valeurs actuelles (DOM d'abord, sinon détail initial du club).
  const actuels = [];
  zone.querySelectorAll('.rep-equipe').forEach(function (eq, i) {
    actuels[i] = {
      j: eq.querySelector('.rep-eq-joueurs').value,
      e: eq.querySelector('.rep-eq-educateurs').value
    };
  });
  const init = (detailInitial && detailInitial[nomCat]) || [];
  let html = '';
  for (let i = 0; i < nb; i++) {
    const v = actuels[i] || (init[i] ? { j: String(init[i].j), e: String(init[i].e) } : { j: '', e: '1' });
    html +=
      '<div class="rep-equipe">' +
        '<span class="rep-eq-nom">Équipe ' + (i + 1) + '</span>' +
        '<label>joueurs <input type="number" class="rep-eq-joueurs" min="1" inputmode="numeric" value="' + echapper(v.j) + '"></label>' +
        '<label>éducateurs <input type="number" class="rep-eq-educateurs" min="0" inputmode="numeric" value="' + echapper(v.e) + '"></label>' +
        '<span class="rep-eq-note" role="status"></span>' +
      '</div>';
  }
  zone.innerHTML = html;
  zone.querySelectorAll('.rep-equipe').forEach(function (eq) { majNoteEquipe(ligne, eq); });
  majTotaux();
}

/** Note FFR d'UNE équipe : au minimum → recommandation DOUCE (jamais bloquante) ; sous le minimum
 *  → signal clair (bloquant à l'envoi). La règle : à l'effectif mini, chaque enfant joue la
 *  quasi-totalité du temps de jeu, or la FFR le plafonne par joueur et par jour. */
function majNoteEquipe(ligne, eq) {
  const note = eq.querySelector('.rep-eq-note');
  const effMin = parseInt(ligne.getAttribute('data-effmin'), 10);
  const j = parseInt(eq.querySelector('.rep-eq-joueurs').value, 10);
  note.className = 'rep-eq-note';
  note.textContent = '';
  if (!isFinite(effMin) || !isFinite(j)) return;
  if (j < effMin) {
    note.classList.add('rep-eq-note-mini');
    note.textContent = '⚠️ ' + effMin + ' joueurs minimum par équipe (règle FFR).';
  } else if (j === effMin) {
    note.classList.add('rep-eq-note-conseil');
    note.textContent = '💡 À ' + effMin + ' joueurs (le minimum), chaque enfant joue la quasi-totalité ' +
      'du temps de jeu — la FFR le plafonne par joueur et par jour. Si possible, venez à ' + (effMin + 1) +
      ' ou plus pour faire tourner.';
  }
}

/** Recalcule et affiche les totaux joueurs / éducateurs (catégories cochées uniquement). */
function majTotaux() {
  const zone = document.getElementById('rep-totaux');
  if (!zone) return;
  let tj = 0, te = 0, unChiffre = false;
  document.querySelectorAll('.rep-cat').forEach(function (ligne) {
    if (!ligne.querySelector('.rep-cat-case').checked) return;
    ligne.querySelectorAll('.rep-equipe').forEach(function (eq) {
      const j = parseInt(eq.querySelector('.rep-eq-joueurs').value, 10);
      const e = parseInt(eq.querySelector('.rep-eq-educateurs').value, 10);
      if (isFinite(j)) { tj += j; unChiffre = true; }
      if (isFinite(e)) { te += e; unChiffre = true; }
    });
  });
  zone.hidden = !unChiffre;
  document.getElementById('rep-total-joueurs').textContent = String(tj);
  document.getElementById('rep-total-educateurs').textContent = String(te);
}

/* --------------------------------------------------------------------------
   ÉVÉNEMENTS
   -------------------------------------------------------------------------- */

function brancherEvenements() {
  const zone = document.getElementById('reponse');
  zone.addEventListener('click', onClicReponse);
  zone.addEventListener('change', onChangeReponse);
  zone.addEventListener('input', onInputReponse);
  const form = document.getElementById('form-presence');
  if (form) form.addEventListener('submit', onConfirmerPresence);
  // Détail par équipe : rend les lignes des catégories déjà cochées (club qui rouvre sa réponse).
  document.querySelectorAll('.rep-cat').forEach(function (ligne) {
    if (ligne.querySelector('.rep-cat-case').checked) majDetailEquipes(ligne);
  });
}

function onClicReponse(e) {
  const cible = e.target;
  if (cible.closest('#btn-present')) {
    document.getElementById('rep-zone-present').hidden = false;
    document.getElementById('rep-zone-absent').hidden = true;
    document.getElementById('rep-zone-present').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (cible.closest('#btn-absent')) {
    document.getElementById('rep-zone-absent').hidden = false;
    document.getElementById('rep-zone-present').hidden = true;
  } else if (cible.closest('#btn-annuler')) {
    document.getElementById('rep-zone-absent').hidden = true;
  } else if (cible.closest('#btn-decline-confirm')) {
    envoyerDecline(cible.closest('#btn-decline-confirm'));
  }
}

/** Coche/décoche une catégorie : montre/masque son champ « nombre d'équipes ». */
function onChangeReponse(e) {
  const boite = e.target.closest('.rep-cat-case');
  if (!boite) return;
  const ligne = boite.closest('.rep-cat');
  const nb = ligne.querySelector('.rep-cat-nb');
  const champ = ligne.querySelector('.rep-cat-equipes');
  const detailZone = ligne.querySelector('.rep-cat-detail');
  if (boite.checked) {
    nb.hidden = false;
    if (champ && !txt(champ.value)) champ.value = '1';
    if (detailZone) detailZone.hidden = false;
    majDetailEquipes(ligne);
    validerLigneCat(ligne);
  } else {
    nb.hidden = true;
    ligne.querySelector('.rep-cat-err').textContent = '';
    if (detailZone) { detailZone.hidden = true; }
  }
  majTotaux();
}

/** Validation EN DIRECT du nombre d'équipes vs le maximum de la catégorie. */
function onInputReponse(e) {
  const champ = e.target.closest('.rep-cat-equipes');
  if (champ) {
    const ligne = champ.closest('.rep-cat');
    validerLigneCat(ligne);
    majDetailEquipes(ligne);
    return;
  }
  const eqInput = e.target.closest('.rep-eq-joueurs, .rep-eq-educateurs');
  if (eqInput) {
    const ligne = eqInput.closest('.rep-cat');
    majNoteEquipe(ligne, eqInput.closest('.rep-equipe'));
    majTotaux();
  }
}

/** Vérifie une ligne catégorie : nombre ≥ 1 et ≤ max si défini. Renvoie true si valide. */
function validerLigneCat(ligne) {
  const err = ligne.querySelector('.rep-cat-err');
  const champ = ligne.querySelector('.rep-cat-equipes');
  const max = parseInt(ligne.getAttribute('data-max'), 10);
  const nb = parseInt(champ.value, 10);
  err.textContent = '';
  if (!isFinite(nb) || nb < 1) { err.textContent = 'Indiquez au moins 1 équipe.'; return false; }
  if (isFinite(max) && nb > max) {
    err.textContent = 'Maximum ' + max + ' équipe' + (max > 1 ? 's' : '') + ' par club pour cette catégorie.';
    return false;
  }
  return true;
}

/** Soumission « Confirmer notre participation ». */
async function onConfirmerPresence(e) {
  e.preventDefault();
  const msg = document.getElementById('rep-form-msg');
  msg.textContent = '';
  msg.className = 'rep-form-msg';

  const cochees = Array.prototype.slice.call(document.querySelectorAll('.rep-cat')).filter(function (l) {
    return l.querySelector('.rep-cat-case').checked;
  });
  if (!cochees.length) { msg.textContent = '⚠️ Sélectionnez au moins une catégorie.'; msg.classList.add('ko'); return; }

  const parCat = {};
  let valide = true;
  cochees.forEach(function (l) {
    if (!validerLigneCat(l)) { valide = false; return; }
    parCat[l.getAttribute('data-cat')] = parseInt(l.querySelector('.rep-cat-equipes').value, 10);
  });
  if (!valide) { msg.textContent = '⚠️ Corrigez les nombres d\'équipes indiqués.'; msg.classList.add('ko'); return; }

  // Détail par équipe : joueurs (≥ min FFR, bloquant) + éducateurs (≥ 0). Totaux calculés ici
  // pour l'envoi de compatibilité (nb_joueurs_total) — le serveur recalcule de toute façon.
  const detail = {};
  let totalJoueurs = 0;
  let detailValide = true;
  cochees.forEach(function (l) {
    const nomCat = l.getAttribute('data-cat');
    const effMin = parseInt(l.getAttribute('data-effmin'), 10);
    const eqs = [];
    l.querySelectorAll('.rep-equipe').forEach(function (eq) {
      const j = parseInt(eq.querySelector('.rep-eq-joueurs').value, 10);
      let ed = parseInt(eq.querySelector('.rep-eq-educateurs').value, 10);
      if (!isFinite(ed) || ed < 0) ed = 0;
      if (!isFinite(j) || j < 1 || (isFinite(effMin) && j < effMin)) { detailValide = false; }
      eqs.push({ j: j, e: ed });
      if (isFinite(j)) totalJoueurs += j;
    });
    if (eqs.length !== parCat[nomCat]) detailValide = false;
    detail[nomCat] = eqs;
  });
  if (!detailValide) {
    msg.textContent = '⚠️ Indiquez les joueurs de chaque équipe (minimum FFR respecté).';
    msg.classList.add('ko');
    return;
  }

  const bouton = document.getElementById('btn-confirmer');
  bouton.disabled = true;
  const texte = bouton.textContent;
  bouton.textContent = 'Envoi…';
  try {
    await apiPost('repondreInvitation', {
      tournoi: repParams.tournoi, club: repParams.club, token: repParams.token,
      reponse: 'accepte',
      nb_equipes_par_categorie: JSON.stringify(parCat),
      detail_effectifs: JSON.stringify(detail),
      nb_joueurs_total: totalJoueurs
    });
    afficherConfirmation('🎉 Merci, votre participation est enregistrée !',
      'Votre dossier complet vous sera envoyé prochainement par l\'organisation.');
  } catch (erreur) {
    msg.textContent = '⚠️ ' + erreur.message;
    msg.classList.add('ko');
    bouton.disabled = false;
    bouton.textContent = texte;
  }
}

/** Envoi de la réponse « Décliné ». */
async function envoyerDecline(bouton) {
  bouton.disabled = true;
  const texte = bouton.textContent;
  bouton.textContent = 'Envoi…';
  try {
    await apiPost('repondreInvitation', {
      tournoi: repParams.tournoi, club: repParams.club, token: repParams.token, reponse: 'decline'
    });
    afficherConfirmation('Merci pour votre retour', 'Nous avons bien noté que votre club ne pourra pas participer cette fois. Au plaisir de vous compter parmi nous à une prochaine édition !');
  } catch (erreur) {
    bouton.disabled = false;
    bouton.textContent = texte;
    const zone = document.getElementById('rep-zone-absent');
    zone.insertAdjacentHTML('beforeend', '<p class="rep-form-msg ko">⚠️ ' + echapper(erreur.message) + '</p>');
  }
}

/** Remplace les choix par un message de confirmation final (fin du parcours). */
function afficherConfirmation(titre, texte) {
  [document.querySelector('.rep-choix'),
   document.getElementById('rep-zone-present'),
   document.getElementById('rep-zone-absent'),
   document.querySelector('.rep-deja')].forEach(function (el) { if (el) el.hidden = true; });
  const zone = document.getElementById('rep-message-final');
  zone.innerHTML = '<div class="rep-merci"><h2>' + echapper(titre) + '</h2><p>' + echapper(texte) + '</p></div>';
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* Les petits helpers (txt, dateLongueFr, urlAffiche, jsonSur, parseCategoriesEngagees)
   sont désormais dans commun-dossier.js (partagés avec dossier/invitation). */
