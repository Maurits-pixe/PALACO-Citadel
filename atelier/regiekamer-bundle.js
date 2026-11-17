/* PALACO Atelier portable draft bundle v1. Local creative data only. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PalacoAtelierBundle=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const EX='palaco.citadel.atelier.grand-studio.v1';
const IN='palaco.citadel.atelier.interior.v1';
const NOTE='palaco.citadel.atelier.regiekamer.note.v1';
const keys=Object.freeze([EX,IN,NOTE]);
const extKinds=new Set(['royal','home','park','water','culture','trade','care','path','observatory','atelier','garden','bridge']);
const intKinds=new Set(['salon','bedroom','kitchen','bath','library','gallery','atelier','terrace','hall','stairs','pool','wellness','dining','greenhouse']);
const scales=new Set(['Dorp','Stad','Gemeente','Community','Metropool']);
const styles=new Set(['PALACO · Emerald & Gold','Neoklassiek','Organische architectuur','Art Deco','Toekomstig minimalisme']);
const moods=new Set(['Gouden uur','Ochtendlicht','Sterrennacht','Lente','Winterglans']);
const materials=new Set(['Smaragd & goud','Marmer & travertin','Warm eiken & linnen','Art Deco & messing','Glas & licht']);
const lights=new Set(['Gouden avond','Zacht daglicht','Museumlicht','Warme kaarsgloed','Koel maanlicht']);
const text=(v,n)=>typeof v==='string'&&v.length<=n;
const cells=(a,n,kinds)=>Array.isArray(a)&&a.length===n&&a.every(x=>x===null||kinds.has(x));
function validExterior(v){return !!(v&&v.schema==='palaco.citadel.atelier.studio/1'&&v.state==='DRAFT'&&v.authority==='NONE'&&text(v.name,80)&&scales.has(v.scale)&&styles.has(v.style)&&moods.has(v.mood)&&cells(v.cells,96,extKinds));}
function validInterior(v){return !!(v&&v.schema==='palaco.citadel.atelier.interior/1'&&v.state==='DRAFT'&&v.authority==='NONE'&&text(v.name,80)&&materials.has(v.material)&&lights.has(v.mood)&&Array.isArray(v.floors)&&v.floors.length===3&&v.floors.every(f=>cells(f,80,intKinds)));}
function cleanExterior(v){
 if(!validExterior(v))throw Error('Ongeldige exterieurgegevens');
 return {schema:v.schema,state:'DRAFT',authority:'NONE',name:v.name,scale:v.scale,style:v.style,mood:v.mood,cells:v.cells.slice(),snapshots:[]};
}
function cleanInterior(v){
 if(!validInterior(v))throw Error('Ongeldige interieurgegevens');
 return {schema:v.schema,state:'DRAFT',authority:'NONE',name:v.name,material:v.material,mood:v.mood,floors:v.floors.map(f=>f.slice())};
}
function create(exterior,interior,note){
 if(exterior!==null&&!validExterior(exterior))throw Error('Exterieur heeft ongeldige DRAFT-gegevens');
 if(interior!==null&&!validInterior(interior))throw Error('Interieur heeft ongeldige DRAFT-gegevens');
 if(!text(note,6000))throw Error('Ontwerpnotitie ongeldig');
 return {schema:'palaco.citadel.atelier.portable/1',state:'DRAFT',authority:'NONE',purpose:'CREATIVE_BACKUP_ONLY',exterior:exterior?cleanExterior(exterior):null,interior:interior?cleanInterior(interior):null,note,limitations:['No authorization','No official identity','No server registration','No issuance']};
}
function parse(input){
 if(typeof input!=='string'||input.length>150000)throw Error('Bestand te groot of ongeldig');
 const b=JSON.parse(input);
 if(!b||b.schema!=='palaco.citadel.atelier.portable/1'||b.state!=='DRAFT'||b.authority!=='NONE'||b.purpose!=='CREATIVE_BACKUP_ONLY')throw Error('Onbekend of niet-geautoriseerd pakket');
 if(!Object.prototype.hasOwnProperty.call(b,'exterior')||!Object.prototype.hasOwnProperty.call(b,'interior')||!Object.prototype.hasOwnProperty.call(b,'note'))throw Error('Ontbrekende verplichte onderdelen');
 return create(b.exterior,b.interior,b.note);
}
function read(storage){
 const get=k=>{const s=storage.getItem(k);return s===null?null:JSON.parse(s);};
 let exterior=null,interior=null;
 try{const e=get(EX);if(validExterior(e))exterior=e;}catch{}
 try{const i=get(IN);if(validInterior(i))interior=i;}catch{}
 const note=storage.getItem(NOTE);
 return create(exterior,interior,typeof note==='string'?note.slice(0,6000):'');
}
function snapshot(storage){
 return keys.map(key=>storage.getItem(key));
}
function restore(storage,bundle,expectedSnapshot){
 const b=parse(JSON.stringify(bundle));
 // Optimistic compare: refuse a write if another tab changed source data after preview.
 const prior=snapshot(storage);
 if(expectedSnapshot!==undefined){
   if(!Array.isArray(expectedSnapshot)||expectedSnapshot.length!==keys.length||expectedSnapshot.some((value,i)=>prior[i]!==value)){
     throw Error('Lokaal project gewijzigd sinds de controle. Heropen het bestand en controleer opnieuw.');
   }
 }
 const changes=[[EX,b.exterior?JSON.stringify(b.exterior):null],[IN,b.interior?JSON.stringify(b.interior):null],[NOTE,b.note]];
 try{
   changes.forEach(([key,value])=>value===null?storage.removeItem(key):storage.setItem(key,value));
 }catch(err){
   // Rollback is best effort: localStorage has no multi-key atomic transactions.
   let rollbackOk=true;
   for(let i=0;i<keys.length;i++){
     try{prior[i]===null?storage.removeItem(keys[i]):storage.setItem(keys[i],prior[i]);}catch{rollbackOk=false;}
   }
   if(!rollbackOk)throw Error('Herstel onderbroken en terugdraaien mislukt. Stop met bewerken en controleer lokale gegevens.');
   throw Error('Herstel mislukt; oorspronkelijke opslag teruggezet.');
 }
 return {exterior:!!b.exterior,interior:!!b.interior,noteLength:b.note.length};
}
return Object.freeze({EX,IN,NOTE,validExterior,validInterior,create,parse,read,snapshot,restore});
});
