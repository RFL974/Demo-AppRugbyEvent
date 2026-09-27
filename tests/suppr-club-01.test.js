#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-invitations.js'), 'utf8');

/** Extrait une déclaration de fonction complète, sans charger le reste du module navigateur. */
function extraireFonction(nom) {
  const debut = source.indexOf('async function ' + nom + '(');
  if (debut === -1) throw new Error('Fonction introuvable : ' + nom);
  const ouvre = source.indexOf('{', debut);
  let profondeur = 0;
  let quote = '';
  let echappe = false;
  let commentaireLigne = false;
  let commentaireBloc = false;
  for (let i = ouvre; i < source.length; i++) {
    const c = source[i];
    const suivant = source[i + 1];
    if (commentaireLigne) {
      if (c === '\n') commentaireLigne = false;
      continue;
    }
    if (commentaireBloc) {
      if (c === '*' && suivant === '/') { commentaireBloc = false; i++; }
      continue;
    }
    if (quote) {
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && suivant === '/') { commentaireLigne = true; i++; continue; }
    if (c === '/' && suivant === '*') { commentaireBloc = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') profondeur++;
    if (c === '}' && --profondeur === 0) return source.slice(debut, i + 1);
  }
  throw new Error('Fin de fonction introuvable : ' + nom);
}

const code = extraireFonction('supprimerClubInviteUI');
let total = 0;
let echecs = 0;

function verifier(codeTest, libelle, condition, preuve) {
  total++;
  if (condition) return console.log('OK ' + codeTest + ' — ' + libelle);
  echecs++;
  console.error('ÉCHEC ' + codeTest + ' — ' + libelle + '\n  ' + JSON.stringify(preuve).slice(0, 1200));
}

async function scenario(options) {
  const o = options || {};
  const appels = [];
  const lectures = [];
  const evenements = [];
  const messages = [];
  const bouton = {
    disabled: false,
    getAttribute(nom) { return nom === 'data-club' ? 'CLUB TEST' : null; }
  };
  const zone = {};
  const contexte = {
    console,
    ETAT_DANS_LA_REPONSE: Object.freeze({ renvoyer_etat: 'oui' }),
    clubsInvitesCourants: [{ club_nom: 'CLUB TEST' }, { club_nom: 'AUTRE CLUB' }],
    document: { getElementById() { return zone; } },
    memeTexteSouple(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); },
    dialogAlerter: async () => {},
    dialogConfirmer: async () => true,
    afficherMessage(_zone, texte, type) { messages.push({ texte, type }); evenements.push('message:' + type); },
    issueIncertaine(erreur) { return !(erreur && erreur.reponse && typeof erreur.reponse === 'object'); },
    messageIncertain(quoi) { return '⚠️ ' + quoi + '. Rien n’est renvoyé automatiquement.'; },
    async ecrireInvitation(action, data) {
      appels.push({ action, data: Object.assign({}, data) });
      if (data.apercu === 'oui') return { ok: true, apercu: true, cible_club_id: 'club-actif-2',
        equipes_supprimables: o.avecEquipe ? [{ id_equipe: 'E1', nom: 'CLUB TEST', categorie: 'U10' }] : [],
        equipes_bloquees: [] };
      if (o.erreur) throw o.erreur;
      return o.reponse;
    },
    async appliquerOuRelireEtat(res, relire) {
      evenements.push('appliquer');
      if (res && Array.isArray(res.clubs)) {
        contexte.clubsInvitesCourants = res.clubs;
        return true;
      }
      if (relire && relire.clubs) return contexte.rafraichirRessourceAdmin('clubsInvites');
      return false;
    },
    async rafraichirRessourceAdmin(nom) {
      lectures.push(nom);
      contexte.clubsInvitesCourants = o.relectureAbsente ? [{ club_nom: 'AUTRE CLUB' }]
        : [{ club_nom: 'CLUB TEST' }, { club_nom: 'AUTRE CLUB' }];
      return true;
    },
    async rechargerEquipes() { lectures.push('equipes'); return true; },
    Promise
  };
  vm.createContext(contexte);
  vm.runInContext(code, contexte);
  await contexte.supprimerClubInviteUI(bouton);
  return { appels, lectures, evenements, messages, bouton, clubs: contexte.clubsInvitesCourants };
}

(async () => {
  // A — succès : l'état est appliqué avant le message, et le POST réel porte la cible de l'aperçu.
  const a = await scenario({ reponse: { ok: true, confirme: true, cible_club_id: 'club-actif-2',
    equipes_supprimees: [], clubs: [{ club_nom: 'AUTRE CLUB' }] } });
  verifier('A.1', 'succès seulement après application de l’état relu ; cible active transmise au POST réel',
    a.appels.length === 2 && a.appels[1].data.club_id === 'club-actif-2' &&
      a.evenements.indexOf('appliquer') < a.evenements.indexOf('message:ok') &&
      a.messages.some((m) => m.type === 'ok' && /retiré/.test(m.texte)) && a.lectures.length === 0,
    a);

  // B — réponse techniquement positive mais état inchangé : jamais de faux succès.
  const b = await scenario({ reponse: { ok: true, confirme: true, equipes_supprimees: [],
    clubs: [{ club_nom: 'CLUB TEST' }, { club_nom: 'AUTRE CLUB' }] } });
  verifier('B.1', '{ok:true} ambigu/incohérent : club encore relu, aucun message de succès',
    b.appels.length === 2 && !b.messages.some((m) => m.type === 'ok') &&
      b.messages.some((m) => m.type === 'ko' && /n’est pas confirmé/.test(m.texte)),
    b);

  // C — réponse perdue après effet serveur : relecture sûre, succès confirmé, aucun rejeu du POST.
  const erreurReseau = new Error('HTTP 404');
  const c = await scenario({ erreur: erreurReseau, relectureAbsente: true, avecEquipe: true });
  verifier('C.1', 'réponse perdue après effet : une relecture clubs + équipes confirme, jamais de troisième POST',
    c.appels.length === 2 && c.lectures.filter((x) => x === 'clubsInvites').length === 1 &&
      c.lectures.filter((x) => x === 'equipes').length === 1 &&
      c.messages.some((m) => m.type === 'ok' && /confirmé par la relecture/.test(m.texte)),
    c);

  // D — réponse perdue avant effet : relecture tranche l'échec, aucun faux succès ni rejeu.
  const d = await scenario({ erreur: new Error('réseau coupé'), relectureAbsente: false });
  verifier('D.1', 'réponse perdue sans effet : le club reste présent, échec explicite, aucun rejeu automatique',
    d.appels.length === 2 && !d.messages.some((m) => m.type === 'ok') &&
      d.messages.some((m) => m.type === 'ko' && /n’a pas eu lieu/.test(m.texte)),
    d);

  // E — backend ancien sans listes : une seule relecture sûre avant le succès.
  const e = await scenario({ reponse: { ok: true, equipes_supprimees: [] }, relectureAbsente: true });
  verifier('E.1', 'backend ancien : absence confirmée par une seule relecture, puis succès',
    e.appels.length === 2 && e.lectures.filter((x) => x === 'clubsInvites').length === 1 &&
      e.messages.some((m) => m.type === 'ok' && /retiré/.test(m.texte)),
    e);

  console.log('\n' + (echecs ? 'ÉCHEC — ' + echecs + ' / ' + total : 'OK — ' + total + ' contrôles SUPPR-CLUB-01 UI'));
  process.exitCode = echecs ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
