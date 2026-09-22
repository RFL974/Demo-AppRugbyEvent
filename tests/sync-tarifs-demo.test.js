#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=vm.createContext({});vm.runInContext(read('../backend/Code.gs'),api);
let cfg={tarif_engagement_oui:'oui',tarif_engagement_montant:'50',tarif_engagement_mode:'par_equipe',repas_sur_place_oui:'oui',repas_sur_place_mode:'prix_personne',repas_sur_place_montant:'10',gouter_fin_tournoi_oui:'oui',gouter_fin_tournoi_mode:'prix_personne',gouter_fin_tournoi_montant:'5'};
let clubs=[{club_nom:'Démo',club_contact_email:'demo@example.invalid',statut:'Accepté',nb_equipes_par_categorie:'{"U10":2}',nb_joueurs_total:'20',nb_educateurs_total:'2',detail_effectifs:JSON.stringify({_restauration:api.validerCommandeRestauration(cfg,{U10:2},20,2,{repas_joueurs:10,gouter_joueurs:8}).commande})}];
api.lireConfig=()=>({global:cfg});api.clubsEditionActive=()=>structuredClone(clubs);api.ecrireChampsConfig=(_,d,ks)=>{for(const k of ks)if(d[k]!=null)cfg[k]=d[k];};api.ecrireEngagementClub=(_,n,d)=>{Object.assign(clubs[0],d);return{ok:true};};
const forms={};for(const id of ['form-modalites','form-surplace'])forms[id]=Object.fromEntries(Object.entries({...cfg,date_limite_confirmation:'',tarif_engagement_modalites:'',buvette_disponible:'non',boutique_disponible:'non',espace_sandwich_disponible:'non'}).map(([k,v])=>[k,{value:v,checked:v==='oui'}]));
let renders=0,emails=0;const messages=[];const front=vm.createContext({console,document:{addEventListener(){},getElementById:id=>forms[id]||{}},configCourante:{global:{...cfg}},clubsInvitesCourants:structuredClone(clubs),avecBoutonOccupe:async(_b,_m,fn)=>fn(),afficherMessage:(_m,t)=>messages.push(t),ecrireAdmin:async(action,data)=>{const r=api[action]({getSheetByName:()=>({})},data);if(r.error)throw Error(r.error);return r;}});
for(const file of ['js/admin-invitations.js','js/admin-infos-publication.js','js/admin-suivi-clubs.js'])vm.runInContext(read(file),front,{filename:file});
front.majDossier=()=>{};front.majApercuInvitation=()=>{};front.afficherClubsInvites=()=>{};front.afficherSuiviClubs=()=>renders++;
(async()=>{
 forms['form-modalites'].tarif_engagement_montant.value='60,25';await front.onEnregistrerModalites();
 assert.equal(front.suiviClubCommande(front.clubsInvitesCourants[0]).total,260.5,'enregistrer le prix réaffiche le suivi immédiatement');assert.equal(renders,1);
 forms['form-modalites'].tarif_engagement_mode.value='par_club';await front.onEnregistrerModalites();assert.equal(front.suiviClubCommande(front.clubsInvitesCourants[0]).total,200.25);
 forms['form-surplace'].repas_sur_place_montant.value='11,25';forms['form-surplace'].gouter_fin_tournoi_montant.value='4,75';await front.onEnregistrerSurPlace();
 assert.equal(front.suiviClubCommande(front.clubsInvitesCourants[0]).total,210.75,'le suivi reçoit les nouveaux prix repas et goûter sans bouton Démo ni rechargement');assert.equal(renders,3);
 assert.deepEqual(JSON.stringify(front.clubsInvitesCourants),JSON.stringify(clubs),'affichage et stockage concordent');
 const before=JSON.stringify(front.clubsInvitesCourants);front.ecrireAdmin=async()=>{throw Error('réseau');};const dejaDits=messages.length;await front.onEnregistrerModalites();assert(/n’est pas confirmé/.test(messages.slice(dejaDits).join(' ')),'réseau coupé : enregistrement dit non confirmé, jamais renvoyé');assert.equal(JSON.stringify(front.clubsInvitesCourants),before,'aucun prix non sauvegardé ne devient un montant de suivi');assert.equal(renders,3);
 console.log('OK — 9 contrôles de bout en bout : sauvegarde des formulaires → serveur → suivi affiché.');
})().catch(e=>{console.error(e);process.exitCode=1;});
