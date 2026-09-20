'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dom={};
for(const id of ['liste-clubs-invites','message-club-invite','liste-suivi-clubs','suivi-clubs-resume','suivi-clubs-filtres','message-suivi-clubs'])dom[id]={innerHTML:'',textContent:''};
let cartes=[];
const c=vm.createContext({console,URL,URLSearchParams,setTimeout,
 window:{location:{href:'https://example.invalid/admin.html',search:''},addEventListener(){}},
 document:{getElementById:id=>dom[id]||null,querySelector:()=>null,querySelectorAll:()=>cartes,addEventListener(){}}
});
for(const file of ['commun','admin','admin-infos-publication','admin-invitations','admin-suivi-clubs','admin-equipes'])
 vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),c);
vm.runInContext(`configCourante={global:{},categories:[{categorie:'U10',presente:'oui'},{categorie:'U12',presente:'oui'}]};
 clubsInvitesCourants=[{club_nom:'ANTONY',statut:'Accepté',categories_engagees:'U10,U12',club_contact_email:'contact@example.invalid'},
 {club_nom:'RACING 92',statut:'Accepté',selection_enregistree:'2026-09-20',categories_engagees:'U10'}];
 equipesCourantes=[{id_equipe:'e1',nom_equipe:'ANTONY-1',categorie:'U10',source:'manuel'}];`,c);
const clubs=vm.runInContext('clubsInvitesCourants',c),club=clubs[0];
c.majApercuInvitation=()=>{};c.majApercuDossierEmail=()=>{};
c.afficherMessage=(el,text)=>{el.textContent=text};
function rendu(){c.afficherClubsInvites();c.afficherSuiviClubs();}
function etatAttendu(club,etat){
 assert.equal(c.etatClubInvite(club),etat);assert.equal(c.suiviClubEtat(club).inscription,etat);
}
function dossierActif(club){return !/data-action="envoyer-dossier"[^>]*disabled/.test(c.suiviActionsHtml(club,c.suiviClubEtat(club)));}
// Une équipe existante suffit, même sans trace d'enregistrement et sans toutes les catégories annoncées.
etatAttendu(club,'equipes-ajoutees');assert(dossierActif(club));
assert(c.panneauAccepteClub(club,club.club_nom).includes(' disabled'));
// Une ancienne trace ne prouve rien si les équipes ont été retirées.
etatAttendu(clubs[1],'a-enregistrer');assert(!dossierActif(clubs[1]));
rendu();
for(const id of ['liste-clubs-invites','liste-suivi-clubs']){
 assert(dom[id].innerHTML.includes('club-etat-equipes-ajoutees" data-club="ANTONY"'));
 assert(dom[id].innerHTML.includes('club-etat-a-enregistrer" data-club="RACING 92"'));
}
// Le rappel de blocage a quitté le tableau pour la FICHE du club (panneau latéral), où il est
// visible sans second clic : c'est l'explication du bouton « dossier final » grisé.
const ficheBloquee=c.suiviHtmlFiche(clubs[1]);
assert(ficheBloquee.includes('suivi-rappel-equipes'));
assert(ficheBloquee.includes('pour débloquer l’envoi du dossier final'));
assert(!c.suiviHtmlFiche(club).includes('suivi-rappel-equipes'));
// Catégories absentes sur un ancien engagement : le dossier reste disponible et utilise les équipes.
club.categories_engagees='';assert(dossierActif(club));assert.equal(c.categoriesDuClubInvite(club).join(','),'U10');
// Évite d'attribuer une équipe au mauvais club (PUC et PUC-2 sont deux clubs distincts).
const puc={club_nom:'PUC',statut:'Accepté'},puc2={club_nom:'PUC-2',statut:'Accepté'};
clubs.push(puc,puc2);
vm.runInContext(`equipesCourantes=[{nom_equipe:'PUC-2',categorie:'U10'},{nom_equipe:'PUCoussin',categorie:'U10'}]`,c);
etatAttendu(puc,'a-enregistrer');etatAttendu(puc2,'equipes-ajoutees');
vm.runInContext(`equipesCourantes=[{nom_equipe:'  antony-2  ',categorie:'U12'}]`,c);
etatAttendu(club,'equipes-ajoutees');
// Actualisation ciblée : ne détruit pas le formulaire pendant la saisie.
const badge={},classes=new Set(),button={disabled:false,title:'',getAttribute:()=>null};
let selection=['U10','U12'];const prenom={value:''};
const panneau={getAttribute:key=>({'data-club':'ANTONY','data-categories-initiales':'U10,U12','data-prenom-initial':''}[key]??null),
 querySelectorAll:()=>selection.map(value=>({value})),querySelector:sel=>sel==='.club-prenom-input'?prenom:button};
cartes=[{getAttribute:()=> 'ANTONY',classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)},
 querySelector:sel=>sel==='.club-etat-badge'?badge:panneau}];
c.actualiserEtatClubsDepuisEquipes();assert(button.disabled);assert.equal(badge.textContent,'Équipes ajoutées');
selection=['U10'];c.actualiserEtatClubsDepuisEquipes();assert(!button.disabled);assert.equal(selection.length,1);
selection=['U10','U12'];c.actualiserEtatClubsDepuisEquipes();assert(button.disabled);
c.afficherEquipes=()=>{};c.majTableauBord=()=>{};c.masquerRepriseEquipes=()=>{};
(async()=>{
 let previews=0,renewals=0;c.ouvrirApercuEmail=()=>previews++;c.renouvelerLienSiDemande=async()=>{renewals++;return false};
 await c.genererDossierFinal('ANTONY');assert.equal(previews,1);
 await c.genererDossierFinal('RACING 92');assert.equal(previews,1);assert.equal(renewals,1);
 // Relecture réelle de la liste vide : deux cartes orange et dossier bloqué.
 c.apiGet=async()=>[];await c.rechargerEquipes();
 etatAttendu(club,'a-enregistrer');assert(!button.disabled);assert.equal(badge.textContent,'Équipes à ajouter');
 assert(classes.has('club-etat-a-enregistrer')&&!classes.has('club-etat-equipes-ajoutees'));
 assert(!dossierActif(club));await c.genererDossierFinal('ANTONY');assert.equal(previews,1);
 // L'ajout manuel confirmé remet immédiatement les deux vues en bleu, sans reload de page.
 c.integrerEquipeAjoutee({id_equipe:'nouvelle',nom_equipe:'ANTONY',categorie:'U10'});
 assert(button.disabled);assert.equal(badge.textContent,'Équipes ajoutées');assert(dossierActif(club));
 assert(dom['liste-suivi-clubs'].innerHTML.includes('club-etat-equipes-ajoutees" data-club="ANTONY"'));
 // Une lecture plus ancienne ne doit pas annuler un ajout confirmé.
 let resolve;c.apiGet=()=>new Promise(r=>resolve=r);const lecture=c.rechargerEquipes();
 c.integrerEquipeAjoutee({id_equipe:'seconde',nom_equipe:'ANTONY-2',categorie:'U12'});
 resolve([]);assert.equal(await lecture,false);etatAttendu(club,'equipes-ajoutees');assert(button.disabled);
 console.log('OK — état commun, équipes existantes/manuelles, ancien marqueur, collisions, retrait, dossier bloqué et lecture périmée.');
})().catch(e=>{console.error(e);process.exitCode=1});
