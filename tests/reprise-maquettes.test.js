'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'../js',f),'utf8');
let n=0;function check(v,m){assert.ok(v,m);n++;}
const c=vm.createContext({echapper:s=>String(s)});
vm.runInContext(read('admin-invitations.js'),c);
vm.runInContext(read('admin-reglages.js'),c);
const g={heure_rdv:'08:45',heure_debut:'10:00',pause_dejeuner_debut:'12:15',pause_dejeuner_duree_min:'90',heure_fin:'15:27',marge_fin_communiquee_min:'45'};
const ms=[{heure_fin:'14:50'},{heure_fin:'15:27'}];
const avant=JSON.stringify({g,ms});
let r=c.reperesHorairesCiel(g,ms);
check(r.fin==='15:27','La fin des matchs suit le réglage utilisé dans les documents clubs.');
check(r.finCommuniquee==='16:12','La clôture de 45 minutes est ajoutée une seule fois.');
check(r.etapes[3][1]==='13:45','Pause de 90 minutes : reprise à 13:45.');
check(JSON.stringify({g,ms})===avant,'La projection ne modifie aucune donnée.');
r=c.reperesHorairesCiel({...g,heure_fin_communiquee:'17:00'},ms);
check(r.finCommuniquee==='17:00','L’heure explicitement communiquée prime.');
r=c.reperesHorairesCiel({...g,pause_echelonnee:'oui',pause_echelonnee_fin:'14:05'},ms);
check(r.etapes[3][1]==='14:05' && r.echelonnee,'Pause échelonnée : vrai dernier retour.');
r=c.reperesHorairesCiel({...g,heure_fin:''},[]);
check(r.fin===''&&r.finCommuniquee==='','Sans planning : pas de fin inventée.');
const html=c.afficherHoraires(g);
for(const id of ['heure_rdv','heure_debut','heure_fin','heure_fin_auto','heure_fin_communiquee','pause_echelonnee','pause_dejeuner_debut','pause_dejeuner_duree_min','battement_terrain_min','marge_fin_communiquee_min'])check(html.includes('name="'+id+'"'),'Champ conservé : '+id);
check(html.includes('form="form-horaires"'),'La barre persistante soumet le formulaire existant.');
check(html.includes('Options avancées')&&html.includes('<details'),'Les options ouvrent les contrôles.');
const sections=[{dataset:{categorie:'U10'}},{dataset:{categorie:'U12'}}];
const phases=[{dataset:{phase:'matin'}},{dataset:{phase:'aprem'}}];
const zone={innerHTML:'',querySelectorAll:sel=>sel==='.cv-planning-categorie'?sections:phases};
const filtreCat={value:'U12'},filtrePhase={value:'matin'};
const planning=vm.createContext({document:{getElementById:id=>id==='affichage-planning'?zone:id==='cv-filtre-planning-categorie'?filtreCat:id==='cv-filtre-planning-phase'?filtrePhase:{}},
 equipesCourantes:[],configCourante:{categories:[]},editionPoules:false,echapper:s=>String(s),
 libelleArbitreScf:()=>'',ctxScf:()=>({estScf:false}),phaseLabelScf:()=>'',estTermine:s=>s==='terminé'});
vm.runInContext(read('admin-generation.js'),planning);
planning.afficherPlanning([], [{categorie:'U10',terrain:'1',heure_debut:'10:00',equipe_A:'Équipe A',equipe_B:'Équipe B',phase:'poule',poule:'A'}]);
check(typeof zone.onchange==='function','Les filtres sont raccordés à la zone du planning.');
zone.onchange({target:{id:'cv-filtre-planning-categorie'}});
check(sections[0].hidden&&!sections[1].hidden,'Le filtre catégorie masque uniquement les autres catégories.');
check(!phases[0].hidden&&phases[1].hidden,'Le filtre matin masque l’après-midi.');
check(zone.innerHTML.includes('Terrain 1')&&!zone.innerHTML.includes('<input'),'La grille affiche les terrains sans créer de saisie de score.');
// Le bouton commun n’ignore pas une annulation ou une confirmation incertaine de catégorie.
async function sauvegarde(choix,apres){
 const ecritures=[],messages=[];
 const infos={tournoi_nom:{value:'Nom'},tournoi_lieu:{value:'Stade'},tournoi_adresse:{value:'Adresse'},tournoi_description:{value:'Texte'},tournoi_affiche:{value:''}};
 const cadre={tournoi_date:{value:'2027-05-15'},zone_vacances:{value:'C'}};
 let dirty=choix;
 const ctx=vm.createContext({document:{getElementById:id=>id==='form-infos-tournoi'?infos:id==='form-cadre-tournoi'?cadre:{}},
 configCourante:{global:{}},afficheDataURI:'',avecBoutonOccupe:async(b,m,fn)=>fn(),
 choixCategoriesAValider:()=>dirty,onValiderChoixCategories:async()=>{dirty=apres;},
 ecrireAdmin:async(a,d)=>ecritures.push({a,d}),afficherMessage:(el,t)=>messages.push(t),
 lireConfigAdmin:async()=>({global:{}}),majDossier(){},majTableauBord(){}});
 vm.runInContext(read('admin-infos-publication.js'),ctx);
 ctx.majInfosTournoi=()=>{};ctx.majDossier=()=>{};
 await ctx.onEnregistrerInfos();return {ecritures,messages};
}
(async()=>{
 let x=await sauvegarde(false,false);check(x.ecritures.length===1,'Une écriture pour les infos et la date.');
 check(x.ecritures[0].d.tournoi_date==='2027-05-15'&&x.ecritures[0].d.tournoi_nom==='Nom','Les deux cartes sont enregistrées.');
 x=await sauvegarde(true,true);check(x.ecritures.length===0,'Annulation/incertitude des catégories : aucune écriture des infos.');
 check(x.messages.some(t=>t.includes('restent à valider')),'Le blocage est expliqué.');
 x=await sauvegarde(true,false);check(x.ecritures.length===1,'Après confirmation des catégories, l’enregistrement continue.');
 console.log('OK — '+n+' contrôles de reprise des maquettes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
