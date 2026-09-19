'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/admin-sponsors.js'), 'utf8');
let n = 0;
function check(value, msg) { assert.ok(value, msg); n++; }
const elements = {};
function element(id) {
  return elements[id] || (elements[id] = { textContent: id, disabled: false, hidden: false,
    innerHTML: '', focus() {}, classList: { toggle() {} } });
}
const form = element('form-sponsor');
for (const name of ['nom', 'url', 'id_sponsor', 'accroche', 'couleur', 'poids', 'ordre', 'logo_zoom']) form[name] = { value: '', focus() {} };
form.actif = { checked: true };
form.emp_mur = { checked: true };
form.emp_dossier = { checked: true };
let calls = [], mode = 'ok', finish, reloadFinish, resetCount = 0, renders = 0;
const ctx = vm.createContext({ console, navigator: {onLine:true},
  document: { addEventListener() {}, getElementById: element,
    querySelectorAll() { return [element('bouton-enregistrer-sponsor'), element('bouton-annuler-sponsor')]; } },
  SPONSORS_EMPLACEMENTS: ['mur','dossier'],
  afficherMessage(zone, text, type) { zone.textContent = text; zone.type = type; },
  echapper: String, lireReglagesEmplacements: () => ({}),
  async apiPostProtege(action, data, role, label, options) {
    calls.push({action, data, options});
    if(mode==='hold') return new Promise(r=>{finish=r;});
    if(mode==='error') throw Object.assign(new Error('private stack payload'),{name:'TypeError'});
    if(mode==='invalid') return {};
    if(action==='listerSponsors') return {ok:true,sponsors:[]};
    return {ok:true,id_sponsor:'SPTEST'};
  },
  dialogConfirmer: async()=>true,
  rafraichirRessourceAdmin: ()=>new Promise(r=>{reloadFinish=r;}),
  sponsorsRemettreAZero() { ctx.cleared = true; }
});
vm.runInContext(source,ctx);
vm.runInContext('reinitialiserFormSponsor = function () { document.getElementById("form-sponsor").hidden = true; }; afficherListeSponsors = function () {}; lireReglagesEmplacements = function () { return {}; };',ctx);
(async()=>{
  for(const [error, expected] of [
    [{name:'AbortError'}, /délai/], [{name:'SyntaxError'}, /illisible/],
    [{name:'TypeError'}, /connexion/i], [{message:'Clé incorrecte'}, /administrateur/],
    [{message:'Partenaire introuvable'}, /Actualise/], [{message:'stack private'}, /serveur/]
  ]) {
    const msg=ctx.messageErreurSponsors(error,true);
    check(expected.test(msg),'erreur traduite'); check(!msg.includes('private'),'aucun détail interne');
  }
  ctx.navigator.onLine=false; check(/Internet/.test(ctx.messageErreurSponsors({},false)),'hors connexion');ctx.navigator.onLine=true;
  await ctx.onEnregistrerSponsor();check(calls.length===0,'nom obligatoire sans requête');
  form.nom.value='Partenaire test';form.url.value='javascript:alert(1)';
  await ctx.onEnregistrerSponsor();check(calls.length===0,'URL invalide sans requête');form.url.value='';
  mode='error'; await ctx.onEnregistrerSponsor();
  check(form.nom.value==='Partenaire test','saisie conservée en panne');
  check(!element('bouton-enregistrer-sponsor').disabled,'bouton libéré après erreur');
  check(/non confirmé/.test(element('message-sponsor').textContent),'pas de faux échec certain');
  mode='invalid';await ctx.onEnregistrerSponsor();check(!form.hidden,'réponse invalide ne ferme pas le formulaire');
  mode='hold';calls=[];const first=ctx.onEnregistrerSponsor();await ctx.onEnregistrerSponsor();
  check(calls.length===1,'double clic : une seule écriture');
  check(element('bouton-annuler-sponsor').disabled,'annulation bloquée pendant écriture');
  check(calls[0].options.delaiMs===20000,'écriture bornée à 20 s');
  finish({ok:true,id_sponsor:'SPTEST'});await first;
  check(form.hidden,'retour immédiat à la liste');
  check(/enregistré/.test(element('message-sponsors-liste').textContent),'confirmation humaine');
  check(!element('bouton-enregistrer-sponsor').disabled,'pas de blocage sur relecture lente');
  check(typeof reloadFinish==='function','relecture automatique démarrée');reloadFinish(true);
  mode='invalid';check(await ctx.lireFichesSponsors()===false,'lecture invalide refusée');
  check(/illisible/.test(element('liste-sponsors').innerHTML),'lecture invalide visible et non vide');
  mode='error';await ctx.onViderBilan();check(!ctx.cleared,'aucun effacement local si serveur échoue');
  check(/non confirmé/.test(element('message-sponsors-bilan').textContent),'échec effacement signalé');
  mode='hold';vm.runInContext("sponsorsAdmin = [{id_sponsor:'SPTEST',nom:'Test'}]",ctx);calls=[];
  const del=ctx.onSupprimerSponsor('SPTEST',element('delete'));await Promise.resolve();await ctx.onSupprimerSponsor('SPTEST',element('delete'));
  check(calls.length===1,'suppression : une seule requête');finish({ok:true});await del;
  check(/supprimé/.test(element('message-sponsors-liste').textContent),'suppression confirmée');reloadFinish(true);
  console.log(n+' contrôles comportementaux réussis.');
})().catch(e=>{console.error(e);process.exitCode=1;});
