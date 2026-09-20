'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const dom={};
for(const id of ['liste-clubs-invites','message-club-invite']) dom[id]={innerHTML:'',textContent:''};
const c=vm.createContext({console,URL,URLSearchParams,
 window:{location:{href:'https://example.invalid/admin.html',search:''},addEventListener(){}},
 document:{getElementById:id=>dom[id]||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}}
});
for(const name of ['commun','admin','admin-infos-publication','admin-invitations'])vm.runInContext(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'),c);
vm.runInContext(`configCourante={global:{},categories:[{categorie:'U10',presente:'oui'},{categorie:'U12',presente:'oui'}]};
 clubsInvitesCourants=[{club_nom:'Club Test',statut:'Accepté',categories_engagees:'U10,U12',club_contact_prenom:'Alex',invitation_envoyee:'2026-09-20'}];`,c);
const club=vm.runInContext('clubsInvitesCourants[0]',c);
c.majApercuInvitation=()=>{};c.majApercuDossierEmail=()=>{};
c.afficherMessage=(el,text,type)=>{el.textContent=text;el.type=type};
let choix=['U10','U12'];const prenom={value:'Alex'};const attrs={};
const btn={disabled:false,textContent:'Ajouter les équipes au tournoi',title:'',
 getAttribute:key=>key==='data-club'?'Club Test':attrs[key]||null,
 setAttribute:(key,val)=>{attrs[key]=val},removeAttribute:key=>{delete attrs[key]},closest:()=>panneau};
const panneau={getAttribute:key=>key==='data-club'?'Club Test':null,querySelectorAll:()=>choix.map(value=>({value})),
 querySelector:selector=>selector==='.club-prenom-input'?prenom:selector==='.bouton-cats-club'?btn:null};
function rendu(){c.afficherClubsInvites();return dom['liste-clubs-invites'].innerHTML;}
function boutonGrise(){return /class="bouton bouton-cats-club"[^>]* disabled/.test(rendu());}
let count=0;let release;let refresh=0;
c.rechargerEquipes=async()=>{refresh++;vm.runInContext("equipesCourantes=[{id_equipe:'e1',nom_equipe:'Club Test-1',categorie:'U10'}]",c)};
(async()=>{
 assert.equal(c.etatClubInvite(club),'a-enregistrer');assert(rendu().includes('Équipes à ajouter'));assert(!boutonGrise());
 c.ecrireAdmin=async()=>{count++;return new Promise(resolve=>{release=resolve})};
 const pending=c.enregistrerCatsClub(btn);
 assert(btn.disabled);assert.equal(attrs['aria-busy'],'true');assert.equal(c.etatClubInvite(club),'a-enregistrer');
 await c.enregistrerCatsClub(btn);assert.equal(count,1);
 choix=['U10'];c.actualiserBoutonEquipesClub(panneau);assert(btn.disabled);choix=['U10','U12'];
 release({ok:true,selection_enregistree:'2026-09-20',equipes_creees:[{nom:'Club Test-1'}],equipes_supprimees:[]});
 await pending;
 assert.equal(c.etatClubInvite(club),'equipes-ajoutees');assert(rendu().includes('Équipes ajoutées'));assert(boutonGrise());
 assert.equal(refresh,1);assert.equal(attrs['aria-busy'],undefined);assert.equal(dom['message-club-invite'].type,'ok');
 // La preuve enregistrée est stable après relecture et indépendante de l'envoi du dossier.
 const reloaded=JSON.parse(JSON.stringify(club));reloaded.dossier_envoye='2026-09-21';
 assert.equal(c.etatClubInvite(reloaded),'equipes-ajoutees');
 assert(c.panneauAccepteClub(reloaded,reloaded.club_nom).includes(' disabled'));
 club.dossier_envoye='2026-09-21';assert(boutonGrise());
 choix=['U10'];c.actualiserBoutonEquipesClub(panneau);assert(!btn.disabled);
 choix=['U12','U10'];c.actualiserBoutonEquipesClub(panneau);assert(btn.disabled);
 prenom.value='Camille';c.actualiserBoutonEquipesClub(panneau);assert(!btn.disabled);
 prenom.value='Alex';c.actualiserBoutonEquipesClub(panneau);assert(btn.disabled);
 // Une nouvelle réponse ne remet pas en cause la présence d'équipes dans le tournoi.
 club.selection_enregistree='';c.actualiserBoutonEquipesClub(panneau);
 assert.equal(c.etatClubInvite(club),'equipes-ajoutees');assert(btn.disabled);
 // Le retrait de la dernière équipe réactive l'ajout, même avec une ancienne marque.
 vm.runInContext('equipesCourantes=[]',c);club.selection_enregistree='2026-09-20';
 c.actualiserBoutonEquipesClub(panneau);
 assert.equal(c.etatClubInvite(club),'a-enregistrer');assert(!btn.disabled);assert(!boutonGrise());
 c.ecrireAdmin=async()=>{throw Error('Échec de synchronisation')};
 await c.enregistrerCatsClub(btn);assert(!btn.disabled);assert(!boutonGrise());assert.equal(dom['message-club-invite'].type,'ko');
 // Une réponse sans équipe effectivement relue ne prouve pas l'ajout.
 c.rechargerEquipes=async()=>{};
 c.ecrireAdmin=async()=>({ok:true,equipes_creees:[],equipes_supprimees:[]});
 await c.enregistrerCatsClub(btn);assert.equal(c.etatClubInvite(club),'a-enregistrer');assert(!boutonGrise());
 assert(dom['message-club-invite'].textContent.includes('non confirmé'));
 // Un ancien backend dont la synchronisation échoue doit aussi rester orange.
 btn.disabled=false;c.ecrireAdmin=async action=>{if(action==='creerEquipesClub')throw Error('Synchronisation refusée');return {ok:true};};
 await c.enregistrerCatsClub(btn);assert.equal(c.etatClubInvite(club),'a-enregistrer');assert(!boutonGrise());
 console.log('OK — orange, ajout confirmé, bouton désactivé, relecture, dossier envoyé, modifications et échecs.');
})().catch(e=>{console.error(e);process.exitCode=1});
