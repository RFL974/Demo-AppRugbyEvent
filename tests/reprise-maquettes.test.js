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
/* Planning : le filtre est passé des listes déroulantes aux ONGLETS (maquette « Poules &
   planning »). L'intention du contrôle ne change pas — un filtre qui isole une catégorie, une
   grille qui n'ouvre aucune saisie de score. */
const zone={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],appendChild(){}};
const planning=vm.createContext({document:{getElementById:id=>id==='affichage-planning'?zone:{}},
 equipesCourantes:[{id_equipe:'A1',nom_equipe:'CLAMART',categorie:'U10',poule:'A'},
                   {id_equipe:'A2',nom_equipe:'VÉLIZY',categorie:'U10',poule:'A'}],
 configCourante:{categories:[],global:{}},editionPoules:false,echapper:s=>String(s),
 libelleArbitreScf:()=>'',ctxScf:()=>({estScf:false}),phaseLabelScf:()=>'',groupeLabelScf:()=>'',
 pouleEFG:p=>p,formatApresMidiDe:()=>'',nbPoulesNiveauCat:()=>0,estTermine:s=>s==='terminé'});
vm.runInContext(read('admin-generation.js'),planning);
const matchsPlan=[
 {id_match:'M1',categorie:'U10',terrain:'1',heure_debut:'10:00',equipe_A:'A1',equipe_B:'A2',phase:'poule',poule:'A'},
 {id_match:'M2',categorie:'U12',terrain:'2',heure_debut:'10:00',equipe_A:'B1',equipe_B:'B2',phase:'poule',poule:'A'}];
planning.afficherPlanning([{categorie:'U10',nom_poule:'A'}],matchsPlan);
check(zone.innerHTML.includes('data-plan-cat="U10"')&&zone.innerHTML.includes('data-plan-phase="matin"'),
 'Les filtres sont des onglets : catégorie d’un côté, moment de la journée de l’autre.');
check(zone.innerHTML.includes('Terrain 1')&&!zone.innerHTML.includes('<input'),
 'La grille affiche les terrains sans créer de saisie de score.');
check(zone.innerHTML.includes('CLAMART')&&!zone.innerHTML.includes('B1'),
 'Le filtre catégorie n’affiche que les matchs de la catégorie choisie.');
check(typeof zone.onclick==='function','Les onglets sont raccordés à la zone du planning.');
zone.onclick({target:{closest:sel=>sel.includes('data-plan-cat')
 ?{hasAttribute:a=>a==='data-plan-cat',getAttribute:()=>'U12'}:null}});
check(zone.innerHTML.includes('aria-selected="true" tabindex="0" data-plan-cat="U12"'),
 'Cliquer un onglet de catégorie change la catégorie affichée.');
check(zone.innerHTML.indexOf('cv-planning-grille')<zone.innerHTML.indexOf('Composition des poules'),
 '⛔ La composition des poules est ÉCRITE après la grille : l’ordre de lecture suit le DOM (WCAG 2.4.3).');
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
