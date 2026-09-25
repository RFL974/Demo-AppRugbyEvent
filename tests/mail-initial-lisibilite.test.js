'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const c=vm.createContext({console,URL,URLSearchParams,
 window:{location:{href:'https://rfl974.github.io/Demo-AppRugbyEvent/admin.html',search:''},addEventListener(){}},
 document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}}
});
for(const f of ['commun','admin','admin-infos-publication','admin-invitations'])
 vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c);
const g={tournoi_nom:'Tournoi de rugby',tournoi_date:'2027-01-24',tournoi_lieu:'Stade du club',
 tournoi_description:'Joueurs, éducateurs et familles se retrouvent autour des valeurs du rugby pour encourager les jeunes talents et partager un beau moment de convivialité.',
 heure_rdv:'08:45',heure_debut:'10:00',pause_dejeuner_debut:'12:15',pause_dejeuner_duree_min:'90',heure_fin_communiquee:'16:06',
 tarif_engagement_oui:'oui',tarif_engagement_montant:'50,00',tarif_engagement_mode:'par_equipe',
 tarif_engagement_modalites:'Virement bancaire ou chèque à l’ordre du club',date_limite_confirmation:'2027-01-19',
 date_limite_reponse:'2027-01-04',contact_reponse_nom:'Camille Dupont',contact_reponse_tel:'06 12 34 56 78',contact_reponse_email:'camille.dupont@example.invalid',
 referent_nom:'Camille Dupont',referent_tel:'06 12 34 56 78',securite_referent_identique:'oui',
 repas_sur_place_oui:'oui',repas_sur_place_mode:'prix_personne',repas_sur_place_montant:'10.00',
 gouter_fin_tournoi_oui:'oui',gouter_fin_tournoi_mode:'offert_organisateur',buvette_disponible:'oui',espace_sandwich_disponible:'oui'};
const cats=[{categorie:'U10',presente:'oui',forme_jeu:'RE — 7x7',format_mi_temps:'2',duree_mi_temps_min:'10',pause_mi_temps_min:'2',
 recup_entre_matchs_min:'15',effectif_min:'7',effectif_max:'13',max_equipes_par_club:'2',arbitrage_organisation:'Éducateurs',format_apresmidi:'CROISE'}];
const args=['','Bonjour Camille,','Nous avons le plaisir de vous inviter au tournoi.','https://example.invalid/reponse','https://example.invalid/invitation'];
const html=c.emailHtmlInvitation(g,cats,...args),text=c.emailTexteInvitation(g,cats,'Bonjour Camille,',args[2],args[3],args[4]);
for(const output of [html,text]){
 assert(!/LA JOURNÉE|La journée en un coup d'œil|Pause méridienne|08:45|16:06/.test(output));
 assert(/précommande de repas/i.test(output));assert(output.includes('50 € par équipe engagée'));
 assert(output.includes('10.00 € par personne'));assert(output.includes('https://example.invalid/reponse'));
}
assert(!html.includes('🍽️ Repas'));assert(!html.includes('<strong>Repas :</strong>'));
assert(html.includes('max-width:1420px'));assert(html.includes('Organisation adaptée à chaque catégorie'));
assert(html.includes('<details class="cv-email-organisation" open'));
assert(html.includes('<summary'));
assert(html.includes('assets/email-icons/chevron-up.png'));
assert(html.includes('assets/email-icons/chevron-down.png'));
assert(html.includes('Votre réponse'));assert(html.includes('Votre dossier'));
assert(html.includes('Rappel sécurité'));assert(!html.includes('Rappel sécurité FFR'));
assert(html.includes('assets/email-icons/rugby.png'));assert(html.includes('assets/email-icons/timer.png'));
assert(html.includes('Équipes par catégories'));assert(!html.includes('Équipes par club'));
assert(html.includes('06\u00a012\u00a034\u00a056\u00a078'));
assert(html.includes('white-space:nowrap;overflow-wrap:normal;word-break:normal'));
assert(html.includes('Référent tournoi :</span><strong style="color:#0C1C2E;display:block'));
assert(html.indexOf('Modalités d&#39;inscription') < html.indexOf('Réponse à l&#39;invitation'));
assert(c.emailHtmlInvitation({...g,tarif_engagement_mode:'par_club'},cats,...args).includes('50 € par club'));
assert.equal(c.libelleTarifEngagement({...g,tarif_engagement_mode:'',tarif_engagement_montant:'50,00'}),'50 € par équipe engagée');
assert.equal(c.libelleTarifEngagement({...g,tarif_engagement_mode:'',tarif_engagement_montant:'50 € par club'}),'50 € par club');
c.__cats=cats;vm.runInContext('configCourante={global:{},categories:__cats}',c);
const dossier=c.emailHtmlDossier(g,{club_nom:'Club exemple',categories_engagees:'U10'},'https://example.invalid/affiche.png','Bonjour,','Voici le dossier.','https://example.invalid/dossier');
assert(dossier.includes("La journée en un coup d'œil"));
assert(dossier.includes('Affiche — Tournoi de rugby'));
assert(dossier.includes('Votre dossier')&&dossier.includes('assets/email-icons/organisation.png'));
assert(!dossier.includes('Licence FFR')&&!dossier.includes('FDM EDR'));
console.log('OK — invitation sans frise, précommande de repas, euros et unité de facturation, frise du dossier conservée.');
module.exports={html,text};
