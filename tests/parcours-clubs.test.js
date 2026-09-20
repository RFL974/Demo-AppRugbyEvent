'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname,'..');
const dom = {}, clicks = [], posts = [], alerts = [];
const node = () => ({innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){}}});
for(const id of ['liste-clubs-invites','liste-suivi-clubs','suivi-clubs-resume','suivi-clubs-filtres','message-club-invite','message-suivi-clubs','message-invitations','bouton-envoyer-invitations']) dom[id]=node();
const c = vm.createContext({console,URL,URLSearchParams,setTimeout,
 window:{location:{href:'https://example.invalid/admin.html',search:''},addEventListener(){}},
 document:{getElementById:id=>dom[id]||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>{if(type==='click')clicks.push(fn)}}
});
for(const f of ['commun','admin','admin-infos-publication','admin-invitations','admin-suivi-clubs']) vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c);
vm.runInContext(`equipesCourantes=[{id_equipe:'e1',nom_equipe:'Accepté',categorie:'U10'}]; configCourante={global:{},categories:[{categorie:'U10',presente:'oui'}]}; clubsInvitesCourants=[
 {club_nom:'Nouveau',statut:'Invité',club_contact_email:'club@example.invalid'},
 {club_nom:'Déjà invité',statut:'Invité',club_contact_email:'club@example.invalid',invitation_envoyee:'2026-09-20'},
 {club_nom:'Sans email',statut:'Invité'},
 {club_nom:'Accepté',statut:'Accepté',club_contact_email:'club@example.invalid',categories_engagees:'U10',selection_enregistree:'2026-09-20'},
 {club_nom:'Décliné',statut:'Décliné',club_contact_email:'club@example.invalid'}];`,c);
const clubs=vm.runInContext('clubsInvitesCourants',c);
c.majApercuInvitation=()=>{};c.majApercuDossierEmail=()=>{};
c.afficherClubsInvites();
const invitationButtons=Array.from(dom['liste-clubs-invites'].innerHTML.matchAll(/<button[^>]*class="bouton bouton-inviter-club"[^>]*>[\s\S]*?<\/button>/g),m=>m[0]);
const buttonFor=name=>invitationButtons.find(s=>s.includes('data-club="'+name+'"'));
assert(buttonFor('Nouveau').includes('>Envoyer l’invitation</button>'));
assert(!buttonFor('Nouveau').includes('disabled')&&!buttonFor('Nouveau').includes('<svg'));
assert(buttonFor('Déjà invité').includes(' disabled'));
assert(buttonFor('Sans email').includes(' disabled'));
assert(dom['liste-clubs-invites'].innerHTML.includes('Ajouter les équipes au tournoi'));
assert(!dom['liste-clubs-invites'].innerHTML.includes('bouton-generer-dossier'));
let dossier=c.suiviActionsHtml(clubs[3],c.suiviClubEtat(clubs[3]));
assert(dossier.includes('data-action="envoyer-dossier"')&&dossier.includes('Envoyer le dossier final'));
assert(!c.suiviActionsHtml(clubs[4],c.suiviClubEtat(clubs[4])).includes('envoyer-dossier'));
assert(!c.suiviActionsHtml(clubs[0],c.suiviClubEtat(clubs[0])).includes('envoyer-dossier'));
clubs[3].dossier_envoye='2026-09-20';
dossier=c.suiviActionsHtml(clubs[3],c.suiviClubEtat(clubs[3]));
assert(dossier.includes('Renvoyer le dossier final')&&dossier.includes('20/09/2026'));
const noCats={...clubs[3],categories_engagees:''};
assert(!/data-action="envoyer-dossier"[^>]*disabled/.test(c.suiviActionsHtml(noCats,c.suiviClubEtat(noCats))));
c.dialogConfirmer=async()=>true;c.dialogAlerter=async text=>alerts.push(text);
c.afficherMessage=(el,text)=>{if(el)el.textContent=text;};
c.sujetInvitationCourant=()=> 'Invitation test';c.htmlModeleInvitation=()=>'<p>Test</p>';c.texteModeleInvitation=()=> 'Test';
c.baseReponseInvitation=()=> 'https://example.invalid/reponse';c.lienInvitationPublique=()=> 'https://example.invalid/invitation';
c.piecesJointesDossierPourEnvoi=()=>[];
c.ecrireAdmin=async(action,data)=>{posts.push({action,data});return{invitation_envoyee:'2026-09-20',derniere_relance_reponse:data.relance==='oui'?'2026-09-20':''};};
c.rafraichirRessourceAdmin=async()=>{};
(async()=>{
 await c.envoyerInvitationClubUI('Déjà invité');assert.equal(posts.length,0);
 await c.envoyerInvitationClubUI('Déjà invité',{relance:true});assert.equal(posts.length,1);assert.equal(posts[0].data.relance,'oui');
 await c.envoyerInvitationClubUI('Nouveau');assert.equal(posts.length,2);assert.equal(clubs[0].invitation_envoyee,'2026-09-20');
 assert(/data-club="Nouveau" disabled>Envoyer l’invitation/.test(dom['liste-clubs-invites'].innerHTML));
 await c.envoyerInvitationClubUI('Nouveau');assert.equal(posts.length,2);
 clubs[0].invitation_envoyee='';c.ecrireAdmin=async()=>{throw Error('Échec simulé')};
 await c.envoyerInvitationClubUI('Nouveau');assert.equal(clubs[0].invitation_envoyee,'');
 c.afficherClubsInvites();assert(!/data-club="Nouveau" disabled>Envoyer l’invitation/.test(dom['liste-clubs-invites'].innerHTML));
 c.ecrireAdmin=async(action,data)=>{posts.push({action,data});return{envoyes:[],echecs:[]};};
 await c.onEnvoyerInvitationsGroupe();assert.equal(posts.at(-1).data.renvoyer,'non');
 let dossierOuvert='';const original=c.genererDossierFinal;c.genererDossierFinal=nom=>{dossierOuvert=nom;};
 const btn={disabled:false,getAttribute:k=>k==='data-action'?'envoyer-dossier':'Accepté'};
 const event={target:{closest:s=>s==='#liste-suivi-clubs [data-action][data-club]'?btn:null}};
 clicks.forEach(fn=>fn(event));assert.equal(dossierOuvert,'Accepté');
 dossierOuvert='';btn.disabled=true;clicks.forEach(fn=>fn(event));assert.equal(dossierOuvert,'');
 c.genererDossierFinal=original;let preview=0;c.renouvelerLienSiDemande=async()=>false;c.ouvrirApercuEmail=()=>preview++;
 await c.genererDossierFinal('Décliné');assert.equal(preview,0);
 await c.genererDossierFinal('Accepté');assert.equal(preview,1);
 console.log('OK — invitation initiale, relance, échec, envoi groupé et dossier depuis le suivi.');
})().catch(e=>{console.error(e);process.exitCode=1;});
