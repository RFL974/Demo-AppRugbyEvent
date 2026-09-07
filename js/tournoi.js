/**
 * ============================================================================
 *  LE TOURNOI — page publique unique (lecture seule)
 * ============================================================================
 *
 *  Regroupe en 2 onglets ce qui était auparavant 3 pages séparées :
 *   • 📋 Mon équipe  — sélection d'une équipe → ses matchs + ses classements (onglet par défaut)
 *   • 🏆 Classements — derniers scores du tournoi, puis poules (matin) + niveaux croisés (après-midi)
 *
 *  Un SEUL appel réseau (getAll) et un SEUL rafraîchissement auto (60 s) alimentent
 *  les 2 vues. Barème partout identique au backend : V=3 / N=2 / D=1, départage par
 *  la différence (BP − BC) puis les points marqués ; seuls les matchs « terminé » comptent.
 *
 *  Nécessite (chargés AVANT ce fichier) : config.js puis api.js.
 * ============================================================================
 */

let equipes = [];
let matchs = [];
let config = { global: {} };
let sponsors = [];                  // partenaires actifs (servis par l'instantané)
let sponsorsReg = null;             // réglages d'affichage normalisés
let sponsorFil = null;              // partenaire de l'encart au fil — FIGÉ pour la session
let sponsorFilCompte = false;       // son affichage n'est compté qu'une fois
let sponsorsSignature = '';         // évite de redessiner (et de relancer la rotation) pour rien
let sponsorPleinFait = false;       // l'interstitiel ne se joue qu'au chargement, jamais sur un refresh
let nomParEquipe = {};       // index id_equipe → nom (reconstruit à chaque chargement)
let derniereSignature = '';
let categorieActive = '';
let minuteurRafraichissement = null; // minuteur du prochain rafraîchissement (null = en pause)
const CLE_EQUIPE = 'r92_mon_equipe';
const CLE_CATEGORIE = 'r92_ma_categorie';
const INTERVALLE_MS = 15000; // rafraîchissement auto ~15 s (marge sous le plafond Apps Script)
const JITTER_MS = 4000;      // étalement aléatoire : évite que tous les spectateurs appellent en même temps
const DELAI_REQUETE_MS = 12000; // délai max d'une requête : au-delà on abandonne (réseau mobile qui « pend »)

/* ==========================================================================
   DÉMARRAGE / NAVIGATION
   ========================================================================== */

async function initTournoi() {
  document.querySelectorAll('.onglet[data-onglet]').forEach(function (b) {
    b.addEventListener('click', function () { basculer(b.getAttribute('data-onglet')); });
  });
  document.getElementById('btn-refresh').addEventListener('click', onRafraichir);

  const sel = document.getElementById('select-equipe');
  sel.addEventListener('change', function () {
    localStorage.setItem(CLE_EQUIPE, sel.value);
    afficherEquipe();
  });

  // Filtre catégorie global : repeuple les équipes et réaffiche les deux onglets.
  document.getElementById('select-categorie').addEventListener('change', function (e) {
    categorieActive = e.target.value;
    localStorage.setItem(CLE_CATEGORIE, categorieActive);
    peuplerSelect();   // limite les équipes à la catégorie choisie
    afficherTout();
  });

  // ⚡ Onglet remis au premier plan (téléphone déverrouillé, retour depuis une autre
  // appli) : on recharge TOUT DE SUITE (données fraîches sans attendre jusqu'à ~19 s)
  // et on relance le rafraîchissement automatique s'il s'était mis en pause.
  // Le garde-fou « minuteur déjà en place » empêche de lancer deux boucles en parallèle.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || minuteurRafraichissement != null) return;
    planifierProchainChargement(0); // recharge immédiate + boucle relancée
  });

  await charger(true);
  planifierProchainChargement();
}

/**
 * Planifie le prochain rafraîchissement automatique avec un ÉTALEMENT aléatoire (jitter) :
 * chaque spectateur poll à un instant légèrement différent, ce qui évite les pics où les
 * 1300 appellent le serveur à la même seconde. On enchaîne APRÈS la fin du chargement
 * précédent (pas de setInterval) pour ne jamais empiler les requêtes.
 *
 * ⚡ PAUSE EN ARRIÈRE-PLAN : si l'onglet est caché au moment de recharger (téléphone
 * verrouillé, autre appli ouverte), on NE recharge PAS et on arrête la boucle — personne
 * ne regarde, autant épargner le serveur (des centaines de téléphones « en poche » qui
 * appelleraient pour rien) et la batterie. Le retour au premier plan relance immédiatement
 * (écouteur visibilitychange posé dans initTournoi).
 *
 * @param {number} [delaiMs] délai imposé (ex : 0 pour une reprise immédiate) ;
 *                           sans argument → intervalle normal + étalement aléatoire.
 */
function planifierProchainChargement(delaiMs) {
  const delai = (delaiMs != null) ? delaiMs : INTERVALLE_MS + Math.floor(Math.random() * JITTER_MS);
  minuteurRafraichissement = setTimeout(function () {
    if (document.hidden) { minuteurRafraichissement = null; return; } // pause (reprise au retour)
    Promise.resolve(charger(false)).finally(function () { planifierProchainChargement(); });
  }, delai);
}

/** Bascule d'onglet : montre une vue, cache l'autre. */
function basculer(cible) {
  document.querySelectorAll('.onglet[data-onglet]').forEach(function (b) {
    const actif = b.getAttribute('data-onglet') === cible;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  document.getElementById('vue-equipe').hidden = (cible !== 'equipe');
  document.getElementById('vue-classements').hidden = (cible !== 'classements');
}

/**
 * Lit les données publiques. En priorité via le RELAIS CDN (config SNAPSHOT_URL) qui tient
 * une grosse audience ; repli automatique sur Apps Script si le relais est vide ou en panne.
 * On NE met PAS de paramètre anti-cache ici : on veut au contraire profiter du cache du CDN
 * (partagé entre tous les spectateurs). Le Worker fixe une fraîcheur courte (~8 s).
 *
 * ⚡ Chaque requête a un DÉLAI MAXIMUM (DELAI_REQUETE_MS) : au-delà, elle est abandonnée.
 * Sans ça, une connexion mobile qui « pend » indéfiniment gèlerait la boucle de
 * rafraîchissement (elle n'enchaîne qu'après la fin de la requête précédente).
 */
async function lireDonnees() {
  if (typeof SNAPSHOT_URL === 'string' && SNAPSHOT_URL) {
    try {
      const controleur = new AbortController();
      const minuteur = setTimeout(function () { controleur.abort(); }, DELAI_REQUETE_MS);
      try {
        const r = await fetch(SNAPSHOT_URL, { signal: controleur.signal });
        if (r.ok) {
          const d = await r.json();
          if (d && !d.error && d.matchs) return d; // snapshot valide
        }
      } finally { clearTimeout(minuteur); }
    } catch (e) { /* relais indisponible ou trop lent → on bascule sur Apps Script */ }
  }
  return apiGet('getAll', null, { delaiMs: DELAI_REQUETE_MS }); // repli (ou mode sans relais)
}

/** (Re)charge les données. Ne ré-affiche que si elles ont changé (évite le clignotement). */
async function charger(premier) {
  try {
    const data = await lireDonnees();
    const signature = JSON.stringify(data.matchs) + '|' + JSON.stringify(data.equipes);
    equipes = data.equipes || [];
    matchs = data.matchs || [];
    config = data.config || { global: {} };
    nomParEquipe = indexerNoms(equipes); // index id → nom (O(1)), reconstruit à chaque chargement
    majHeure();
    majTitre(); // le bandeau prend le nom de l'événement s'il est renseigné

    // Partenaires : réglages + liste, AVANT l'affichage (l'encart au fil s'insère dans les vues).
    sponsorsReg = sponsorsReglages(config);
    sponsors = sponsorsReg.actifs ? sponsorsListe(data, sponsorsReg) : [];
    // L'encart au fil est tiré UNE FOIS pour toute la session : il ne doit pas changer sous les
    // yeux du lecteur à chaque rafraîchissement automatique (toutes les ~15 s).
    if (sponsors.length && !sponsorFil) {
      sponsorFil = sponsorsTirer('fil', sponsorsPourEmplacement(sponsors, 'fil'), true);
    }
    if (!sponsors.length) sponsorFil = null;

    if (premier || signature !== derniereSignature) {
      derniereSignature = signature;
      peuplerCategorie();
      peuplerSelect();
      afficherTout();
    }
    // Verrou de publication (peut changer sans que les matchs/équipes changent).
    appliquerPublication();
    appliquerSponsors(premier);
  } catch (err) {
    if (premier) {
      document.getElementById('mon-planning').innerHTML =
        '<p class="vide">Erreur de chargement : ' + echapper(err.message) + '</p>';
    }
  }
}

/** Réaffiche les deux vues d'un coup (+ le podium, commun aux deux onglets). */
function afficherTout() {
  afficherPodium();
  afficherEquipe();
  afficherClassements();
}

/**
 * Affiche le podium dans l'encadré commun (visible sur les deux onglets), pour la
 * catégorie active — mais UNIQUEMENT s'il est mathématiquement certain (cf. podiumCertain).
 */
function afficherPodium() {
  const zone = document.getElementById('podium');
  if (!zone) return;
  const top = estPublie() ? podiumCertain(categorieActive) : null;
  if (!top) { zone.hidden = true; zone.innerHTML = ''; return; }

  const medailles = ['🥇', '🥈', '🥉'];
  let html = '<div class="podium-titre">🏆 Podium' +
    (categorieActive ? ' <span class="podium-cat">' + echapper(categorieActive) + '</span>' : '') + '</div>';
  top.forEach(function (t, i) {
    html += '<div class="podium-ligne podium-' + (i + 1) + '">' +
      '<span class="podium-rang">' + medailles[i] + '</span>' +
      '<span class="podium-nom">' + echapper(t.nom) + '</span>' +
    '</div>';
  });
  zone.innerHTML = html;
  zone.hidden = false;
}

/** Vrai si le tournoi est publié (rendu visible depuis l'admin). */
function estPublie() {
  return String(config.global && config.global.tournoi_publie).toLowerCase() === 'oui';
}

/**
 * Verrou de publication : tant que le tournoi n'est pas publié, on masque tout le contenu
 * (barre, onglets, filtre, vues) et on affiche l'écran « à venir ». Sinon, on montre la page.
 */
function appliquerPublication() {
  const pub = estPublie();
  document.getElementById('tournoi-avenir').hidden = pub;
  document.querySelector('.live-barre').hidden = !pub;
  document.querySelector('.onglets').hidden = !pub;
  document.getElementById('vues').hidden = !pub;
  // Le podium : masqué si non publié ; sinon c'est afficherPodium qui décide (certitude).
  if (!pub) { const pod = document.getElementById('podium'); if (pod) pod.hidden = true; }
  // Le filtre catégorie : masqué si non publié ; sinon c'est peuplerCategorie qui décide.
  if (!pub) document.getElementById('filtre-categorie').hidden = true;
}

/* ==========================================================================
   PARTENAIRES (sponsors) — emplacements A, B, D, E
   --------------------------------------------------------------------------
   L'emplacement C (encart au fil) est inséré directement dans les vues, par
   afficherEquipe et afficherClassements. Tout le moteur est dans sponsors.js.
   ========================================================================== */

/**
 * Dessine (ou efface) les emplacements partenaires. Les zones A, B et E ne sont redessinées
 * QUE si la composition change : sinon chaque rafraîchissement automatique relancerait la
 * rotation du rail depuis le début et regonflerait le compteur d'affichages.
 *
 * Tout est conditionné à la publication du tournoi : sur l'écran « à venir », la page reste
 * exactement celle d'aujourd'hui.
 *
 * @param {boolean} premier vrai au tout premier chargement (autorise l'interstitiel)
 */
function appliquerSponsors(premier) {
  const zoneBandeau = document.getElementById('sp-bandeau');
  const zoneRail = document.getElementById('sp-rail');
  const zoneBarre = document.getElementById('sp-barre');
  const zoneMur = document.getElementById('sp-mur');
  if (!zoneBandeau) return;

  const montrer = !!(sponsorsReg && sponsorsReg.actifs && sponsors.length && estPublie());
  if (!montrer) {
    [zoneBandeau, zoneRail, zoneBarre, zoneMur].forEach(function (z) {
      if (z) { z.hidden = true; z.innerHTML = ''; }
    });
    document.body.classList.remove('sp-barre-active');
    sponsorsSignature = '';
    return;
  }

  const signature = sponsors.map(function (s) {
    return s.id_sponsor + ':' + s.emplacements + ':' + s.poids;
  }).join('|') + '#' + sponsorsReg.rotationS + '#' + sponsorsReg.mur + '#' + sponsorsReg.barreMobile;

  if (signature !== sponsorsSignature) {
    sponsorsSignature = signature;

    // A — bandeau principal.
    const htmlBandeau = sponsorsRendreBandeau(sponsors);
    zoneBandeau.innerHTML = htmlBandeau;
    zoneBandeau.hidden = !htmlBandeau;

    // B — rail (ordinateur) et barre basse (téléphone) : même contenu, deux rendus.
    const htmlRail = sponsorsRendreRail(sponsors);
    if (zoneRail) { zoneRail.innerHTML = htmlRail; zoneRail.hidden = !htmlRail; }
    if (zoneBarre) {
      const avecBarre = !!htmlRail && sponsorsReg.barreMobile;
      zoneBarre.innerHTML = avecBarre ? htmlRail : '';
      zoneBarre.hidden = !avecBarre;
      // Le corps de page réserve la hauteur de la barre : elle ne recouvre jamais un score.
      document.body.classList.toggle('sp-barre-active', avecBarre);
    }

    // E — mur des partenaires.
    const htmlMur = sponsorsReg.mur ? sponsorsRendreMur(sponsors) : '';
    if (zoneMur) { zoneMur.innerHTML = htmlMur; zoneMur.hidden = !htmlMur; }

    [zoneBandeau, zoneRail, zoneBarre, zoneMur].forEach(function (z) {
      if (z && !z.hidden) sponsorsBrancherMesure(z);
    });
    // Des partenaires sont réellement à l'écran : on arme la remontée des relevés, pour que
    // la fiche de visibilité porte sur TOUS les spectateurs et non sur le seul appareil qui
    // la consulte. Rien n'est envoyé si les sponsors sont éteints — on n'arrive jamais ici.
    sponsorsArmerEnvoi();
    // La rotation pilote les DEUX rendus du rail (colonne et barre) : une seule est visible
    // à la fois selon la largeur d'écran, mais toutes deux doivent rester synchronisées.
    sponsorsDemarrerRotation([zoneRail, zoneBarre], sponsorsReg.rotationS);
  }

  // D — interstitiel : au chargement seulement, jamais sur un rafraîchissement automatique.
  if (premier && !sponsorPleinFait) {
    sponsorPleinFait = true;
    const candidats = sponsorsPourEmplacement(sponsors, 'plein');
    const visites = sponsorsCompterVisite();
    if (sponsorsPeutAfficherPlein(sponsorsReg, candidats, visites, estPublie())) {
      sponsorsAfficherPlein(sponsorsTirer('plein', candidats, true), sponsorsReg);
    }
  }

  if (sponsorsReg.demo) afficherBandeauDemo();
}

/**
 * Encart partenaire (emplacement C) prêt à insérer dans une vue. Son affichage n'est compté
 * qu'une seule fois : la vue est reconstruite à chaque rafraîchissement, mais c'est le même
 * encart, sous les mêmes yeux.
 */
function encartFil() {
  if (!sponsorsReg || !sponsorsReg.actifs || !sponsorFil || !estPublie()) return '';
  return sponsorsRendreFil(sponsorFil);
}

/** Rebranche la mesure sur les encarts au fil après un rendu de vue. */
function brancherEncartsFil() {
  const zones = [document.getElementById('mon-planning'), document.getElementById('vue-classements')];
  zones.forEach(function (z) {
    if (z) sponsorsBrancherMesure(z, { sansAffichage: sponsorFilCompte });
  });
  if (sponsorFil) sponsorFilCompte = true;
}

/**
 * Barre flottante du MODE DÉMO (?demo=sponsors) : rejouer l'interstitiel à volonté et
 * repérer les emplacements. Absente de la page publique normale.
 */
function afficherBandeauDemo() {
  if (document.getElementById('sp-demo')) return;
  const barre = document.createElement('div');
  barre.id = 'sp-demo';
  barre.className = 'sp-demo';
  barre.innerHTML =
    '<span class="sp-demo-titre">Mode démo</span>' +
    '<button type="button" id="sp-demo-plein">Rejouer le plein écran</button>' +
    '<button type="button" id="sp-demo-reperes">Repérer les emplacements</button>';
  document.body.appendChild(barre);

  document.getElementById('sp-demo-plein').addEventListener('click', function () {
    const candidats = sponsorsPourEmplacement(sponsors, 'plein');
    if (candidats.length) sponsorsAfficherPlein(sponsorsTirer('plein', candidats, true), sponsorsReg);
  });
  document.getElementById('sp-demo-reperes').addEventListener('click', function () {
    document.body.classList.toggle('sp-reperes');
  });
}

function majHeure() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  // On affiche les secondes : ainsi chaque rafraîchissement fait VISIBLEMENT bouger
  // l'heure, même si les données n'ont pas changé (retour clair « ça a marché »).
  document.getElementById('maj').textContent = 'Mis à jour à ' + hh + ':' + mm + ':' + ss;
}

/**
 * Bouton « Rafraîchir » : recharge les données avec un retour visible (bouton désactivé
 * le temps de la requête), puis remet le libellé.
 */
async function onRafraichir() {
  const btn = document.getElementById('btn-refresh');
  const texte = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Rafraîchissement…';
  try {
    await charger(false);
  } finally {
    btn.disabled = false;
    btn.textContent = texte;
  }
}

/**
 * Met le titre de la page (bandeau + onglet du navigateur) au nom de l'événement
 * saisi dans l'admin (config.global.tournoi_nom), sinon garde « Le tournoi ».
 */
function majTitre() {
  const nom = (config.global && config.global.tournoi_nom || '').toString().trim();
  const h1 = document.getElementById('titre-tournoi');
  if (h1) h1.textContent = nom || 'Le tournoi';
  document.title = nom || 'Le tournoi';
}

/* ==========================================================================
   DERNIERS SCORES — fil des résultats récents du tournoi (en haut de Classements)
   ========================================================================== */

function sectionDerniersScores() {
  const finis = matchs.filter(function (m) {
    return estTermine(m.statut) && String(m.score_A) !== '' && String(m.score_B) !== '';
  });
  let h = '<h2 class="live-titre">📣 Derniers scores</h2>';
  if (!finis.length) return h + '<p class="vide">Aucun score pour l\'instant.</p>';

  const tri = finis.slice()
    .sort(function (a, b) { return String(b.heure_fin).localeCompare(String(a.heure_fin)); })
    .slice(0, 8);
  tri.forEach(function (m) { h += ligneScore(m); });
  return h;
}

function ligneScore(m) {
  const a = Number(m.score_A), b = Number(m.score_B);
  const libelle = libelleMatch(m);
  return '<div class="score-ligne">' +
    '<span class="score-meta">' + echapper(m.categorie) + ' · ' + echapper(libelle) + ' · ' + echapper(m.heure_fin) + '</span>' +
    '<div class="score-corps">' +
      '<span class="' + (a > b ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_A)) + '</span>' +
      '<span class="score-chiffres">' + a + ' - ' + b + '</span>' +
      '<span class="' + (b > a ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_B)) + '</span>' +
    '</div></div>';
}

/* ==========================================================================
   📋 MON ÉQUIPE — sélection + matchs + classements de l'équipe
   ========================================================================== */

/**
 * Remplit le menu déroulant des CATÉGORIES (filtre global des deux onglets).
 * Se masque tout seul s'il n'y a qu'une seule catégorie (menu inutile). Fixe `categorieActive`
 * (catégorie mémorisée si toujours présente, sinon la première par ordre alphabétique).
 */
function peuplerCategorie() {
  const bloc = document.getElementById('filtre-categorie');
  const sel = document.getElementById('select-categorie');

  const cats = categoriesPresentes();
  const memo = localStorage.getItem(CLE_CATEGORIE) || '';
  categorieActive = (cats.indexOf(memo) >= 0) ? memo : (cats[0] || '');

  sel.innerHTML = cats.map(function (c) {
    return '<option value="' + echapper(c) + '"' + (c === categorieActive ? ' selected' : '') + '>' +
      echapper(c) + '</option>';
  }).join('');

  bloc.hidden = (cats.length <= 1); // une seule catégorie → menu masqué
}

/** Catégories présentes (celles qui ont au moins une équipe), triées par ordre NUMÉRIQUE
 *  (U8 avant U10 avant U12 — un tri alphabétique classerait « U10 » avant « U8 »). */
function categoriesPresentes() {
  const cats = [];
  equipes.forEach(function (e) { if (e.categorie && cats.indexOf(e.categorie) < 0) cats.push(e.categorie); });
  return cats.sort(comparerCategorie);
}

/* comparerCategorie() est désormais dans commun.js (partagé avec saisie.js). */

/** Remplit le menu déroulant des équipes DE LA CATÉGORIE ACTIVE, en préservant le choix. */
function peuplerSelect() {
  const sel = document.getElementById('select-equipe');
  const choix = sel.value || localStorage.getItem(CLE_EQUIPE) || '';
  const membres = equipes.filter(function (e) { return e.categorie === categorieActive; })
    .slice().sort(function (a, b) { return String(a.nom_equipe).localeCompare(String(b.nom_equipe)); });

  let html = '<option value="">— Choisis ton équipe —</option>';
  membres.forEach(function (e) {
    html += '<option value="' + echapper(e.id_equipe) + '">' + echapper(e.nom_equipe) + '</option>';
  });
  sel.innerHTML = html;
  // On ne re-sélectionne le choix mémorisé que s'il appartient à la catégorie active.
  if (choix && membres.some(function (e) { return e.id_equipe === choix; })) sel.value = choix;
}

function afficherEquipe() {
  const zone = document.getElementById('mon-planning');
  const id = document.getElementById('select-equipe').value;

  if (!id) {
    zone.innerHTML = '<p class="vide">Sélectionne ton équipe pour voir tes matchs.</p>';
    return;
  }
  const mes = matchs.filter(function (m) { return m.equipe_A === id || m.equipe_B === id; });
  if (!mes.length) {
    zone.innerHTML = '<p class="vide">Aucun match pour cette équipe (planning pas encore généré ?).</p>';
    return;
  }

  const matin = mes.filter(function (m) { return String(m.phase) !== 'classement'; });
  const aprem = mes.filter(function (m) { return String(m.phase) === 'classement'; });

  let html = '';
  // Objet catégorie (vocabulaire Super Challenge : Samedi/Dimanche au lieu de Matin/Après-midi).
  const catObjP = (config.categories || []).find(function (c) { return c.categorie === (mes[0] && mes[0].categorie); });
  if (matin.length) html += '<div class="planning-phase">' + (phaseLabelScf(catObjP, false) || '🌅 Matin — poules') + '</div>' + cartes(matin, id);
  if (aprem.length) {
    const fmt = formatApresMidiCat(matchs.find(function (m) { return m.equipe_A === id || m.equipe_B === id; }).categorie);
    const titreAprem = phaseLabelScf(catObjP, true) || ((fmt === 'COUPE_PLATEAU') ? '🏉 Après-midi — Coupe &amp; Plateau'
      : (fmt === 'LIBRE') ? '🏉 Après-midi — matchs amicaux'
      : (fmt === 'POULES_NIVEAU') ? '🏉 Après-midi — poules de niveau'
      : '🏉 Après-midi — classement croisé');
    html += '<div class="planning-phase">' + titreAprem + '</div>' + cartes(aprem, id);
  }

  // Encart partenaire (C) : entre les matchs et les classements — une respiration naturelle
  // du fil, jamais au milieu d'un tableau.
  html += encartFil();

  const eq = equipes.find(function (x) { return x.id_equipe === id; });
  if (eq) html += sectionClassementsEquipe(eq);
  zone.innerHTML = html;
  brancherEncartsFil();
}

/** Cartes de matchs (triées par heure) du point de vue de l'équipe id. */
function cartes(liste, id) {
  return liste.slice()
    .sort(function (a, b) { return String(a.heure_debut).localeCompare(String(b.heure_debut)); })
    .map(function (m) { return carteMatch(m, id); }).join('');
}

function carteMatch(m, id) {
  const estA = m.equipe_A === id;
  const adversaire = nomEquipe(estA ? m.equipe_B : m.equipe_A);
  const monScore = estA ? m.score_A : m.score_B;
  const scoreAdv = estA ? m.score_B : m.score_A;
  const termine = estTermine(m.statut);
  const libelle = libelleMatch(m);

  let resultat;
  if (termine && String(monScore) !== '' && String(scoreAdv) !== '') {
    const a = Number(monScore), b = Number(scoreAdv);
    const issue = a > b ? 'gagne' : (a < b ? 'perd' : 'nul');
    const etiquette = a > b ? 'Victoire' : (a < b ? 'Défaite' : 'Nul');
    resultat = '<span class="mp-resultat ' + issue + '">' + a + ' - ' + b + ' · ' + etiquette + '</span>';
  } else {
    resultat = '<span class="mp-avenir">à venir</span>';
  }
  return '<div class="match' + (termine ? ' match-termine' : '') + '">' +
    '<div class="match-meta">' + echapper(m.heure_debut) + ' · Terrain ' + echapper(String(m.terrain)) +
      ' · ' + echapper(libelle) +
      (libelleArbitreScf(m, nomEquipe) ? ' · <span class="arbitre-tag">🧑‍⚖️ ' + echapper(libelleArbitreScf(m, nomEquipe)) + '</span>' : '') + '</div>' +
    '<div class="mp-ligne"><span class="mp-adv">vs ' + echapper(adversaire) + '</span>' +
      resultat + '</div>' +
  '</div>';
}

/** Les 3 classements affichés sous les matchs de l'équipe : sa poule, son niveau, le général. */
function sectionClassementsEquipe(eq) {
  let html = '';
  // Objet catégorie (vocabulaire Super Challenge : Triangulaire/Quadrangulaire, Poule E/F/G).
  const catObjE = (config.categories || []).find(function (c) { return c.categorie === eq.categorie; });

  // 1) Sa poule du matin.
  const membresPoule = equipes.filter(function (e) { return e.categorie === eq.categorie && e.poule === eq.poule; });
  const matchsMatin = matchs.filter(function (m) { return m.categorie === eq.categorie && String(m.phase) !== 'classement'; });
  html += '<div class="planning-phase">📊 Classement de ta poule (matin)</div>';
  const glP = groupeLabelScf(catObjE, eq.poule, membresPoule.length, false);
  html += tableCompacte(glP ? echapper(glP) : ('Poule ' + echapper(String(eq.poule))),
                        classementGroupe(matchsMatin, membresPoule), eq.id_equipe);

  // 2) & 3) Après-midi : dépend du format de la catégorie.
  const aApresMidi = matchs.some(function (m) {
    return m.categorie === eq.categorie && String(m.phase) === 'classement';
  });
  if (!aApresMidi) return html;
  const fmt = formatApresMidiCat(eq.categorie);

  if (fmt === 'COUPE_PLATEAU') {
    // Arbre de la Coupe + liste du Plateau (le classement croisé n'a pas de sens ici).
    html += sectionBracket(eq.categorie) + sectionPlateau(eq.categorie);
    return html;
  }
  if (fmt === 'LIBRE') {
    // Matchs amicaux : pas de classement l'après-midi.
    return html;
  }

  // CROISE : niveau d'après-midi + classement général du tournoi (comportement historique).
  const matchNiv = matchs.find(function (m) {
    return String(m.phase) === 'classement' && (m.equipe_A === eq.id_equipe || m.equipe_B === eq.id_equipe);
  });
  if (matchNiv) {
    const niv = matchNiv.poule;
    const matchsNiv = matchs.filter(function (m) {
      return m.categorie === eq.categorie && String(m.phase) === 'classement' && m.poule === niv;
    });
    const idsNiv = {};
    matchsNiv.forEach(function (m) { idsNiv[m.equipe_A] = 1; idsNiv[m.equipe_B] = 1; });
    const membresNiv = Object.keys(idsNiv).map(function (x) { return { id_equipe: x, nom_equipe: nomEquipe(x) }; });
    html += '<div class="planning-phase">📊 Classement de ton niveau (après-midi)</div>';
    const glN = groupeLabelScf(catObjE, niv, 0, true)
      || libellePouleNiveau(catObjE, niv, nbPoulesNiveauCat(matchs, eq.categorie));
    html += tableCompacte(glN ? echapper(glN) : ('Niveau ' + echapper(String(niv))),
                          classementGroupe(matchsNiv, membresNiv), eq.id_equipe);
  }

  html += '<div class="planning-phase">🏆 Classement général du tournoi</div>';
  html += tableGeneral(classementGeneral(eq.categorie), eq.id_equipe, !!podiumCertain(eq.categorie));
  return html;
}

/* ==========================================================================
   🏆 CLASSEMENTS — poules (matin) + niveaux croisés (après-midi), tableaux complets
   ========================================================================== */

function afficherClassements() {
  const zone = document.getElementById('vue-classements');
  const matin = classementParGroupe('matin');

  // En tête : le fil des derniers scores du tournoi (portée « tournoi entier », comme les classements).
  // L'encart partenaire (C) se glisse APRÈS les premiers scores : on ne fait jamais attendre
  // le lecteur qui vient chercher un résultat.
  let html = sectionDerniersScores() + encartFil();

  if (!matin.length) {
    zone.innerHTML = html + '<p class="vide">Aucune poule pour le moment.</p>';
    brancherEncartsFil();
    return;
  }

  html += '<div class="planning-phase">🌅 Poules (matin)</div>';
  matin.forEach(function (cat) {
    html += '<h3 class="live-cat">' + echapper(cat.categorie) + '</h3>';
    cat.groupes.forEach(function (g) { html += tableComplete(g.titre, g.classement); });
  });

  html += sectionApresMidiClassements(categorieActive);
  zone.innerHTML = html;
  brancherEncartsFil();
}

/**
 * Classement complet par groupe, pour la vue Classements. FILTRÉ sur la catégorie active.
 * @param phase 'matin' → équipes groupées par leur poule, ne compte que les matchs de poule.
 *              'aprem' → équipes groupées par niveau (poule du match = N1/N2…), ne compte que le classement.
 */
function classementParGroupe(phase) {
  const stats = {}, infos = {};
  if (phase === 'matin') {
    equipes.forEach(function (e) {
      if (!e.poule || e.categorie !== categorieActive) return;
      stats[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe);
      infos[e.id_equipe] = { categorie: e.categorie, cle: e.poule };
    });
    matchs.forEach(function (m) {
      if (m.categorie === categorieActive && String(m.phase) !== 'classement') compterMatch(stats, m);
    });
    return regrouper(stats, infos, 'Poule ');
  }
  const ms = matchs.filter(function (m) {
    return m.categorie === categorieActive && String(m.phase) === 'classement';
  });
  ms.forEach(function (m) {
    [m.equipe_A, m.equipe_B].forEach(function (id) {
      if (!stats[id]) { stats[id] = nouveauStats(id); infos[id] = { categorie: m.categorie, cle: m.poule }; }
    });
  });
  ms.forEach(function (m) { compterMatch(stats, m); });
  const res = regrouper(stats, infos, 'Niveau ');
  // Vocabulaire « Poule haute / basse » quand la catégorie est en POULES_NIVEAU (repli : Niveau N1).
  const catObjG = (config.categories || []).find(function (c) { return c.categorie === categorieActive; });
  const nbNiv = nbPoulesNiveauCat(matchs, categorieActive);
  res.forEach(function (cat) {
    cat.groupes.forEach(function (g) {
      const pn = libellePouleNiveau(catObjG, String(g.titre).replace(/^Niveau /, ''), nbNiv);
      if (pn) g.titre = pn;
    });
  });
  return res;
}

/** Regroupe les stats par catégorie puis par clé (poule ou niveau), trie chaque groupe. */
function regrouper(stats, infos, prefixeTitre) {
  const parCat = {};
  Object.keys(stats).forEach(function (id) {
    const info = infos[id];
    const cat = (parCat[info.categorie] = parCat[info.categorie] || {});
    (cat[info.cle] = cat[info.cle] || []).push(stats[id]);
  });
  const res = [];
  Object.keys(parCat).sort().forEach(function (cat) {
    const groupes = [];
    Object.keys(parCat[cat]).sort().forEach(function (cle) {
      groupes.push({ titre: prefixeTitre + cle, classement: parCat[cat][cle].sort(comparer) });
    });
    res.push({ categorie: cat, groupes: groupes });
  });
  return res;
}

/** Tableau complet : #, Équipe, J, V, N, D, BP, BC, Diff, Pts. */
function tableComplete(titre, liste) {
  let h = '<div class="live-poule">' + echapper(titre) + '</div>';
  h += '<div class="table-scroll"><table class="table-planning table-classement cl-full">' +
    '<thead><tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>N</th><th>D</th>' +
    '<th>BP</th><th>BC</th><th>Diff</th><th>Pts</th></tr></thead><tbody>';
  liste.forEach(function (t, i) {
    const diff = (t.diff > 0 ? '+' : '') + t.diff;
    h += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td class="col-equipe">' + echapper(t.nom_equipe) + '</td>' +
      '<td>' + t.j + '</td><td>' + t.v + '</td><td>' + t.n + '</td><td>' + t.d + '</td>' +
      '<td>' + t.bp + '</td><td>' + t.bc + '</td><td>' + echapper(diff) + '</td>' +
      '<td class="col-pts">' + t.pts + '</td>' +
    '</tr>';
  });
  return h + '</tbody></table></div>';
}

/* ==========================================================================
   CALCULS DE CLASSEMENT (barème commun) + tableaux compacts
   ========================================================================== */

/* ⚠️ BARÈME DE CLASSEMENT — CONTRAT PARTAGÉ AVEC LE BACKEND ⚠️
   Ce barème (points + départage) est RÉIMPLÉMENTÉ à l'identique côté serveur
   (backend/Code.gs : enregistrerResultat + comparerClassement), car Apps Script et le
   navigateur ne peuvent pas partager un même fichier .js. TOUTE modification ici DOIT être
   répercutée là-bas (et inversement) : sinon le classement affiché au public divergerait de
   celui qui sert à générer la phase après-midi (tirage croisé). Spécification unique et
   règles de départage : docs/regles-classement.md */
const POINTS_VICTOIRE = 3;
const POINTS_NUL = 2;
const POINTS_DEFAITE = 1;

function nouveauStats(id, nom) {
  return { id_equipe: id, nom_equipe: nom || nomEquipe(id), j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, diff: 0, pts: 0 };
}
function appliquer(s, pour, contre) {
  s.j++; s.bp += pour; s.bc += contre; s.diff = s.bp - s.bc;
  if (pour > contre) { s.v++; s.pts += POINTS_VICTOIRE; }
  else if (pour === contre) { s.n++; s.pts += POINTS_NUL; }
  else { s.d++; s.pts += POINTS_DEFAITE; }
}
// Départage : points, puis différence de points (BP−BC), puis points marqués (BP) — décroissant.
function comparer(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.diff !== a.diff) return b.diff - a.diff;
  return b.bp - a.bp;
}
function compterMatch(stats, m) {
  if (!estTermine(m.statut)) return;
  const a = stats[m.equipe_A], b = stats[m.equipe_B];
  if (!a || !b) return;
  const sa = Number(m.score_A), sb = Number(m.score_B);
  if (!isFinite(sa) || !isFinite(sb)) return;
  appliquer(a, sa, sb); appliquer(b, sb, sa);
}

/** Classement d'un groupe défini par ses membres (pour la vue « Mon équipe »). */
function classementGroupe(matchsGroupe, membres) {
  const stats = {};
  membres.forEach(function (e) { stats[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe); });
  matchsGroupe.forEach(function (m) { compterMatch(stats, m); });
  return Object.keys(stats).map(function (k) { return stats[k]; }).sort(comparer);
}

/** Numéro de niveau (N1 -> 1) ; 999 si pas de niveau (passe en fin de classement). */
function niveauNum(n) { const m = String(n).match(/(\d+)/); return m ? parseInt(m[1], 10) : 999; }

/**
 * Classement général (croisé final) d'une catégorie : ordonné par NIVEAU (N1 avant N2…),
 * puis par les résultats de l'après-midi, puis (départage) par ceux du matin.
 */
function classementGeneral(categorie) {
  const membres = equipes.filter(function (e) { return e.categorie === categorie && e.poule; });
  const sM = {}, sA = {}, niveau = {};
  membres.forEach(function (e) {
    sM[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe);
    sA[e.id_equipe] = nouveauStats(e.id_equipe, e.nom_equipe);
  });
  matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) !== 'classement'; })
    .forEach(function (m) { compterMatch(sM, m); });
  const matchsAprem = matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) === 'classement'; });
  matchsAprem.forEach(function (m) { compterMatch(sA, m); });
  matchsAprem.forEach(function (m) { niveau[m.equipe_A] = m.poule; niveau[m.equipe_B] = m.poule; });

  return membres.map(function (e) {
    return { id: e.id_equipe, nom: e.nom_equipe, niveau: niveau[e.id_equipe] || '', m: sM[e.id_equipe], a: sA[e.id_equipe] };
  }).sort(function (x, y) {
    const nx = niveauNum(x.niveau), ny = niveauNum(y.niveau);
    if (nx !== ny) return nx - ny;
    return comparer(x.a, y.a) || comparer(x.m, y.m);
  });
}

/* ==========================================================================
   PODIUM CERTAIN — top 3 du classement général, affiché UNIQUEMENT quand il
   est mathématiquement verrouillé (aucun résultat restant ne peut le changer).
   --------------------------------------------------------------------------
   Rappels qui fondent le calcul :
   • Le classement général trie par NIVEAU (figé dès l'après-midi généré),
     puis résultats de l'après-midi, puis (départage) du matin.
   • Barème V=3 / N=2 / D=1 : un match rapporte TOUJOURS entre 1 et 3 points.
   • Les scores sont libres → le goal-average (diff) et les points marqués (bp)
     peuvent basculer avec un gros score. Donc, tant que deux équipes PEUVENT
     encore se rejoindre AUX POINTS, leur ordre n'est pas garanti (un large
     succès pourrait inverser la diff). La certitude n'existe donc que si
     l'écart de points est INATTEIGNABLE, ou si tout est joué.
   ========================================================================== */

/** Nombre de matchs NON terminés d'une équipe, pour une phase donnée. */
function matchsRestants(id, estClassement) {
  return matchs.filter(function (m) {
    const cl = (String(m.phase) === 'classement');
    return cl === estClassement && (m.equipe_A === id || m.equipe_B === id) && !estTermine(m.statut);
  }).length;
}

/**
 * Départage GARANTI sur une clé (après-midi OU matin) entre deux équipes X et Y.
 * sX/sY = stats de la phase ; remX/remY = matchs restants de cette phase.
 * Retourne : 'X' (X devant, certain), 'Y' (Y devant, certain),
 *            'egal' (phase entièrement jouée et strictement à égalité → départage à la clé suivante),
 *            'incertain' (les fourchettes de points se chevauchent et il reste des matchs).
 */
function departageGaranti(sX, sY, remX, remY) {
  const xMin = sX.pts + remX,     xMax = sX.pts + 3 * remX;
  const yMin = sY.pts + remY,     yMax = sY.pts + 3 * remY;
  if (xMin > yMax) return 'X';           // X ne peut plus être rejoint aux points
  if (xMax < yMin) return 'Y';           // Y ne peut plus être rejoint aux points
  // Les fourchettes de points se chevauchent : ordre garanti seulement si TOUT est joué.
  if (remX === 0 && remY === 0) {
    const c = comparer(sX, sY);          // <0 => X devant ; >0 => Y devant ; 0 => égalité stricte
    if (c < 0) return 'X';
    if (c > 0) return 'Y';
    return 'egal';
  }
  return 'incertain';
}

/**
 * Vrai si l'équipe X est GARANTIE devant l'équipe Y dans le classement général,
 * quels que soient les résultats des matchs restants (X, Y = entrées de classementGeneral).
 */
function garantiDevant(X, Y) {
  const nx = niveauNum(X.niveau), ny = niveauNum(Y.niveau);
  if (nx < ny) return true;              // niveau figé : N1 toujours devant N2…
  if (nx > ny) return false;
  // Même niveau → départage après-midi, puis (si égalité stricte) matin.
  const dA = departageGaranti(X.a, Y.a, matchsRestants(X.id, true), matchsRestants(Y.id, true));
  if (dA === 'X') return true;
  if (dA === 'Y' || dA === 'incertain') return false;
  // dA === 'egal' : après-midi joué et à égalité → on départage au matin.
  const dM = departageGaranti(X.m, Y.m, matchsRestants(X.id, false), matchsRestants(Y.id, false));
  return dM === 'X';
}

/**
 * Renvoie le podium (top 3 du classement général) SI et seulement s'il est certain :
 *   - l'après-midi (classement croisé) est généré pour la catégorie ;
 *   - l'ordre interne du trio est garanti ;
 *   - le 3e est garanti devant TOUTES les équipes suivantes (frontière verrouillée).
 * Sinon renvoie null (rien à afficher).
 */
function podiumCertain(categorie) {
  if (!categorie) return null;
  // Pas d'après-midi généré → pas encore de podium.
  const aApresMidi = matchs.some(function (m) {
    return m.categorie === categorie && String(m.phase) === 'classement';
  });
  if (!aApresMidi) return null;
  // Podium en croisé et en coupe (il ne s'affiche que lorsqu'il est réellement DÉCIDÉ).
  // LIBRE = pas de podium (format amical, sans classement, pour les plus jeunes).
  const fmt = formatApresMidiCat(categorie);
  if (fmt === 'LIBRE') return null;
  if (fmt === 'COUPE_PLATEAU') return podiumCoupe(categorie);
  return podiumCroise(categorie);
}

/** Podium du classement croisé : top 3 du classement général, UNIQUEMENT quand il est verrouillé. */
function podiumCroise(categorie) {
  const G = classementGeneral(categorie);
  if (G.length < 3) return null;                 // pas de podium à 3 sans au moins 3 équipes
  const top = G.slice(0, 3);
  // Ordre interne garanti (1er devant 2e, 2e devant 3e) + frontière (3e devant tous les suivants).
  if (!garantiDevant(top[0], top[1])) return null;
  if (!garantiDevant(top[1], top[2])) return null;
  for (let k = 3; k < G.length; k++) {
    if (!garantiDevant(top[2], G[k])) return null;
  }
  return top.map(function (t) { return { nom: t.nom }; });
}

/** Podium Coupe : 🥇 vainqueur de la finale, 🥈 finaliste, 🥉 vainqueur de la petite finale. */
function podiumCoupe(categorie) {
  const coupe = matchs.filter(function (m) {
    return m.categorie === categorie && String(m.sous_tableau).toUpperCase() === 'COUPE';
  });
  const finale = coupe.find(function (m) { return String(m.tour) === 'FINALE'; });
  if (!finale || !estTermine(finale.statut)) return null; // podium pas encore décidé
  const vF = vainqueurAff(finale);
  if (vF !== 'A' && vF !== 'B') return null;               // finale à égalité non départagée
  const orId = (vF === 'A') ? finale.equipe_A : finale.equipe_B;
  const arId = (vF === 'A') ? finale.equipe_B : finale.equipe_A;
  const top = [{ nom: nomEquipe(orId) }, { nom: nomEquipe(arId) }];
  const petite = coupe.find(function (m) { return String(m.tour) === 'PETITE_FINALE'; });
  if (petite && estTermine(petite.statut)) {
    const vP = vainqueurAff(petite);
    if (vP === 'A' || vP === 'B') {
      top.push({ nom: nomEquipe((vP === 'A') ? petite.equipe_A : petite.equipe_B) });
    }
  }
  return top;
}

/** Tableau compact d'un classement de groupe (poule ou niveau). idSel = équipe surlignée. */
function tableCompacte(titre, liste, idSel) {
  let h = '<div class="live-poule">' + titre + '</div>';
  h += '<div class="table-scroll"><table class="table-planning table-classement">' +
    '<thead><tr><th>#</th><th>Équipe</th><th>J</th><th>Diff</th><th>Pts</th></tr></thead><tbody>';
  liste.forEach(function (t, i) {
    const diff = (t.diff > 0 ? '+' : '') + t.diff;
    h += '<tr' + (t.id_equipe === idSel ? ' class="fav-ligne"' : '') + '>' +
      '<td>' + (i + 1) + '</td><td class="col-equipe">' + echapper(t.nom_equipe) + '</td>' +
      '<td>' + t.j + '</td><td>' + echapper(diff) + '</td><td class="col-pts">' + t.pts + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/**
 * Tableau du classement général (place, équipe, niveau, points/diff de l'après-midi).
 * @param idSel équipe à surligner (vue « Mon équipe »), '' sinon.
 * @param marquerVainqueur si vrai, la 1ʳᵉ place reçoit un 🏆 (vainqueur certain).
 */
function tableGeneral(liste, idSel, marquerVainqueur) {
  let h = '<div class="table-scroll"><table class="table-planning table-classement">' +
    '<thead><tr><th>#</th><th>Équipe</th><th>Niveau</th><th>Pts</th><th>Diff</th></tr></thead><tbody>';
  liste.forEach(function (t, i) {
    const diff = (t.a.diff > 0 ? '+' : '') + t.a.diff;
    const vainqueur = marquerVainqueur && i === 0;
    const classes = (t.id === idSel ? 'fav-ligne ' : '') + (vainqueur ? 'cl-vainqueur' : '');
    h += '<tr' + (classes.trim() ? ' class="' + classes.trim() + '"' : '') + '>' +
      '<td>' + (vainqueur ? '🏆' : (i + 1)) + '</td><td class="col-equipe">' + echapper(t.nom) + '</td>' +
      '<td>' + echapper(t.niveau || '—') + '</td><td class="col-pts">' + t.a.pts + '</td><td>' + echapper(diff) + '</td></tr>';
  });
  return h + '</tbody></table></div>';
}

/* ==========================================================================
   APRÈS-MIDI MULTI-FORMATS (Coupe & Plateau / Libre / Croisé)
   ========================================================================== */

/* libelleTourFr() est désormais dans commun.js (partagé avec saisie.js). */

/** Libellé court d'un match (utilisé dans « Mon équipe » et « Derniers scores »). */
function libelleMatch(m) {
  const st = String(m.sous_tableau || '').toUpperCase();
  if (st === 'COUPE') return libelleTourFr(m.tour) + ' · Coupe';
  if (st === 'PLATEAU') return 'Plateau';
  if (String(m.format || '').toUpperCase() === 'LIBRE') return 'Match amical';
  // Vocabulaire Super Challenge (Triangulaire/Quadrangulaire, Poule E/F/G) si la catégorie est en SCF.
  const catObj = (config.categories || []).find(function (c) { return c.categorie === m.categorie; });
  const estClt = String(m.phase) === 'classement';
  const gl = groupeLabelScf(catObj, m.poule, tailleGroupeScf(matchs, m.categorie, m.poule), estClt);
  if (gl) return gl;
  // Vocabulaire « Poule haute / basse » si la catégorie est en POULES_NIVEAU (repli : Niveau N1).
  const pn = estClt ? libellePouleNiveau(catObj, m.poule, nbPoulesNiveauCat(matchs, m.categorie)) : null;
  if (pn) return pn;
  if (estClt) return 'Niveau ' + String(m.poule);
  return 'Poule ' + String(m.poule);
}

/**
 * Format d'après-midi d'une catégorie, déduit des matchs (défaut CROISE).
 * CROISE_DIAGONAL s'affiche EXACTEMENT comme CROISE (mêmes niveaux, même classement général,
 * même podium) : on le mappe donc sur 'CROISE' pour réutiliser toute la logique d'affichage.
 */
function formatApresMidiCat(categorie) {
  const ms = matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) === 'classement'; });
  for (let i = 0; i < ms.length; i++) {
    const f = String(ms[i].format || '').toUpperCase();
    if (f === 'COUPE_PLATEAU' || f === 'LIBRE' || f === 'CROISE' || f === 'POULES_NIVEAU') return f;
    if (f === 'CROISE_DIAGONAL') return 'CROISE';
  }
  return 'CROISE';
}

/** Vainqueur d'un match de Coupe terminé, pour l'affichage : 'A' / 'B' / '' (indéterminé). */
function vainqueurAff(m) {
  if (!estTermine(m.statut)) return '';
  const a = Number(m.score_A), b = Number(m.score_B);
  if (isFinite(a) && isFinite(b)) { if (a > b) return 'A'; if (b > a) return 'B'; }
  if (m.vainqueur) {
    if (String(m.vainqueur) === String(m.equipe_A)) return 'A';
    if (String(m.vainqueur) === String(m.equipe_B)) return 'B';
  }
  return '';
}

/**
 * Section après-midi de la vue Classements, adaptée au format de la catégorie :
 *  COUPE_PLATEAU → arbre de la Coupe + liste du Plateau ; LIBRE → liste de matchs amicaux ;
 *  CROISE → tableaux de niveaux (comportement historique).
 */
function sectionApresMidiClassements(categorie) {
  const apremMs = matchs.filter(function (m) { return m.categorie === categorie && String(m.phase) === 'classement'; });
  if (!apremMs.length) return '';
  const fmt = formatApresMidiCat(categorie);

  if (fmt === 'COUPE_PLATEAU') {
    return '<div class="planning-phase">🏉 Après-midi — Coupe &amp; Plateau</div>' +
      sectionBracket(categorie) + sectionPlateau(categorie);
  }
  if (fmt === 'LIBRE') {
    return '<div class="planning-phase">🏉 Après-midi — matchs amicaux</div>' +
      '<p class="note-amical">🎈 Matchs amicaux supplémentaires — sans classement ni enjeu.</p>' +
      listeResultats(apremMs);
  }
  // CROISE / POULES_NIVEAU (défaut) : tableaux par niveau, PUIS le classement général.
  let html = '<div class="planning-phase">' + ((fmt === 'POULES_NIVEAU')
    ? '🏉 Après-midi — poules de niveau' : '🏉 Après-midi — classement croisé par niveau') + '</div>';
  classementParGroupe('aprem').forEach(function (cat) {
    cat.groupes.forEach(function (g) { html += tableComplete(g.titre, g.classement); });
  });

  const gen = classementGeneral(categorie);
  if (gen.length) {
    const vainqueurCertain = !!podiumCertain(categorie); // top verrouillé (aucun match ne peut le changer)
    html += '<div class="planning-phase">🏆 Classement général du tournoi</div>';
    html += vainqueurCertain
      ? '<p class="note-vainqueur">🏆 Vainqueur du tournoi : <b>' + echapper(gen[0].nom) + '</b></p>'
      : '<p class="note-vainqueur note-provisoire">En tête pour l\'instant : <b>' + echapper(gen[0].nom) + '</b> (provisoire — l\'après-midi n\'est pas fini)</p>';
    html += tableGeneral(gen, '', vainqueurCertain);
  }
  return html;
}

/** Arbre d'élimination de la Coupe (colonnes par tour + petite finale à part). */
function sectionBracket(categorie) {
  const coupe = matchs.filter(function (m) {
    return m.categorie === categorie && String(m.sous_tableau).toUpperCase() === 'COUPE';
  });
  if (!coupe.length) return '';
  const petite = coupe.filter(function (m) { return String(m.tour) === 'PETITE_FINALE'; });
  const principaux = coupe.filter(function (m) { return String(m.tour) !== 'PETITE_FINALE'; });
  const ordreTours = ['SEIZIEME_DE_FINALE', 'HUITIEME_DE_FINALE', 'QUART_DE_FINALE', 'DEMI_FINALE', 'FINALE'];

  let html = '<div class="bracket-titre">🏆 Tableau Coupe</div><div class="bracket-scroll"><div class="bracket">';
  ordreTours.forEach(function (tour) {
    const ms = principaux.filter(function (m) { return String(m.tour) === tour; })
      .sort(function (a, b) { return String(a.id_match).localeCompare(String(b.id_match)); });
    if (!ms.length) return;
    html += '<div class="bracket-col"><div class="bracket-col-titre">' + libelleTourFr(tour) + '</div>';
    ms.forEach(function (m) { html += carteBracket(m); });
    html += '</div>';
  });
  html += '</div></div>';

  if (petite.length) {
    html += '<div class="bracket-petite"><div class="bracket-col-titre">Petite finale (3ᵉ place)</div>';
    petite.forEach(function (m) { html += carteBracket(m); });
    html += '</div>';
  }
  return html;
}

/** Carte d'un match de bracket (2 équipes + scores ; gagnant mis en avant). */
function carteBracket(m) {
  const v = vainqueurAff(m);
  const enAttente = (!m.equipe_A || !m.equipe_B);
  const sa = (String(m.score_A) !== '' && m.score_A != null) ? echapper(String(m.score_A)) : '';
  const sb = (String(m.score_B) !== '' && m.score_B != null) ? echapper(String(m.score_B)) : '';
  const nomA = m.equipe_A ? echapper(nomEquipe(m.equipe_A)) : '<span class="bracket-attente">en attente</span>';
  const nomB = m.equipe_B ? echapper(nomEquipe(m.equipe_B)) : '<span class="bracket-attente">en attente</span>';
  const clsA = (v === 'A') ? ' bracket-gagnant' : (v === 'B' ? ' bracket-perdant' : '');
  const clsB = (v === 'B') ? ' bracket-gagnant' : (v === 'A' ? ' bracket-perdant' : '');
  return '<div class="bracket-match' + (enAttente ? ' bracket-match-attente' : '') + '">' +
      '<div class="bracket-eq' + clsA + '"><span class="bracket-nom">' + nomA + '</span><span class="bracket-score">' + sa + '</span></div>' +
      '<div class="bracket-eq' + clsB + '"><span class="bracket-nom">' + nomB + '</span><span class="bracket-score">' + sb + '</span></div>' +
    '</div>';
}

/** Liste des matchs du Plateau (résultats simples, sans classement). */
function sectionPlateau(categorie) {
  const plateau = matchs.filter(function (m) {
    return m.categorie === categorie && String(m.sous_tableau).toUpperCase() === 'PLATEAU';
  });
  if (!plateau.length) return '';
  return '<div class="bracket-titre">🛡️ Tableau Plateau</div>' + listeResultats(plateau);
}

/** Liste de résultats simples (score ou « à venir »), triée par heure. Sert Plateau et Libre. */
function listeResultats(liste) {
  return liste.slice()
    .sort(function (a, b) { return String(a.heure_debut).localeCompare(String(b.heure_debut)); })
    .map(function (m) {
      const fini = estTermine(m.statut) && String(m.score_A) !== '' && String(m.score_B) !== '';
      const a = Number(m.score_A), b = Number(m.score_B);
      const score = fini ? (a + ' - ' + b) : 'à venir';
      return '<div class="score-ligne">' +
        '<span class="score-meta">' + echapper(m.heure_debut) + ' · Terrain ' + echapper(String(m.terrain)) + '</span>' +
        '<div class="score-corps">' +
          '<span class="' + (fini && a > b ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_A)) + '</span>' +
          '<span class="score-chiffres">' + echapper(score) + '</span>' +
          '<span class="' + (fini && b > a ? 'gagnant' : '') + '">' + echapper(nomEquipe(m.equipe_B)) + '</span>' +
        '</div></div>';
    }).join('');
}

/* ==========================================================================
   OUTILS
   ========================================================================== */

/** Nom lisible d'une équipe (lecture directe dans l'index construit à chaque chargement). */
function nomEquipe(id) {
  return Object.prototype.hasOwnProperty.call(nomParEquipe, id) ? nomParEquipe[id] : id;
}

/* estTermine() et echapper() sont désormais dans commun.js. */

document.addEventListener('DOMContentLoaded', initTournoi);
