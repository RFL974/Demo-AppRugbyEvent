'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};
// Les déplacements de blocs ne doivent supprimer aucun point de raccordement historique.
const contrats=require('./contrats-dom-initial.json');
for(const [file,c] of Object.entries(contrats)){
 const s=read(file),ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 for(const id of c.ids)ok(ids.includes(id),file+': id conservé '+id);
 ok(ids.length===new Set(ids).size,file+': identifiants uniques');
 for(const name of c.champs)ok(s.includes('name="'+name+'"'),file+': champ conservé '+name);
}
// Toute origine locale connue ferme les connexions API à l'environnement distant.
for(const hostname of ['localhost','127.0.0.1','[::1]']){
 const origin='http://'+hostname+':8137';
 const result=vm.runInNewContext(read('js/config.js')+';({api:API_URL,snapshot:SNAPSHOT_URL})',{location:{hostname,origin,protocol:'http:'}});
 ok(result.api===origin+'/__api',hostname+': API locale');ok(result.snapshot==='',hostname+': aucun relais distant');
}
const fileApi=vm.runInNewContext(read('js/config.js')+';API_URL',{location:{hostname:'',protocol:'file:'}});
ok(fileApi==='http://127.0.0.1:8137/__api','fichier local fermé à la production');
// Aucun pourcentage fictif ne doit sortir du rendu zéro match.
const ctx=vm.createContext({document:{addEventListener(){}},echapper:s=>String(s)});
vm.runInContext(read('js/perfs.js'),ctx);
const zero=vm.runInContext("blocBilan('Bilan',0,0,0,0,'')",ctx);
ok(zero.includes('Aucun match joué')&&!zero.includes('0%'),'zéro match explicite');
const avec=vm.runInContext("blocBilan('Bilan',4,3,0,1,'')",ctx);
ok(avec.includes('75%'),'pourcentage joué conservé');
// La page statique fermée ne devient jamais une porte vers la saisie protégée.
ok(!/<script\b/i.test(read('saisie.html')),'saisie statique sans chargement ni appel API');
console.log(`OK — ${n} contrôles Ciel & Verre (DOM, isolation locale, états sans match).`);
