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
const RECOVERY='palaco.citadel.atelier.regiekamer.recovery.v1';
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
function preview(current,incoming){
 const now=parse(JSON.stringify(current));
 const next=parse(JSON.stringify(incoming));
 const compare=(a,b)=>({
   existing:a?a.filter(Boolean).length:0,
   incoming:b?b.filter(Boolean).length:0,
   changed:a&&b?a.reduce((sum,value,i)=>sum+Number(value!==b[i]),0):a||b?(a||b).filter(Boolean).length:0,
   removed:a&&!b?a.filter(Boolean).length:a&&b?a.reduce((sum,value,i)=>sum+Number(Boolean(value)&&!b[i]),0):0
 });
 const exterior=compare(now.exterior?.cells||null,next.exterior?.cells||null);
 const floors=[0,1,2].map(i=>compare(now.interior?.floors[i]||null,next.interior?.floors[i]||null));
 const removed=floors.reduce((a,f)=>a+f.removed,exterior.removed);
 const namesChanged=(now.exterior?.name||'')!==(next.exterior?.name||'')||(now.interior?.name||'')!==(next.interior?.name||'');
 const noteChanged=now.note!==next.note;
 return {exterior,floors,removed,noteChanged,namesChanged,
   replacesExterior:Boolean(now.exterior),replacesInterior:Boolean(now.interior),
   removesExterior:Boolean(now.exterior&&!next.exterior),
   removesInterior:Boolean(now.interior&&!next.interior),
   changed:exterior.changed+floors.reduce((a,f)=>a+f.changed,0)};
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
function getRecovery(storage){
 const raw=storage.getItem(RECOVERY);
 if(raw===null)return null;
 if(raw.length>150000)throw Error('Herstelkopie is te groot');
 const record=JSON.parse(raw);
 if(!record||record.schema!=='palaco.citadel.atelier.recovery/1'||record.authority!=='NONE'||record.state!=='DRAFT'){
   throw Error('Onbekende herstelkopie');
 }
 const draft=parse(JSON.stringify(record.draft));
 if(typeof record.savedAt!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(record.savedAt))throw Error('Ongeldig herstelmoment');
 return {savedAt:record.savedAt,draft};
}
function restoreWithRecovery(storage,bundle,expectedSnapshot){
 const incoming=parse(JSON.stringify(bundle));
 const prior=snapshot(storage);
 if(expectedSnapshot!==undefined&&(!Array.isArray(expectedSnapshot)||expectedSnapshot.length!==keys.length||expectedSnapshot.some((v,i)=>prior[i]!==v))){
   throw Error('Lokaal project gewijzigd sinds de controle. Heropen het bestand en controleer opnieuw.');
 }
 // Never silently discard unreadable source data during a destructive import.
 for(const [i,validate] of [[0,validExterior],[1,validInterior]]){
   if(prior[i]!==null){
     let value;
     try{value=JSON.parse(prior[i]);}catch{throw Error('Bestaande Atelier-bron bevat onleesbare gegevens; exporteer of herstel deze eerst.');}
     if(!validate(value))throw Error('Bestaande Atelier-bron is geen geldig DRAFT-project; automatisch overschrijven geweigerd.');
   }
 }
 if(prior[2]!==null&&prior[2].length>6000)throw Error('Bestaande ontwerpnotitie overschrijdt de veilige limiet');
 const previousRecovery=storage.getItem(RECOVERY);
 const record={schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'NONE',savedAt:new Date().toISOString(),draft:read(storage)};
 try{storage.setItem(RECOVERY,JSON.stringify(record));}
 catch{throw Error('Geen ruimte voor veilige herstelkopie; import afgebroken zonder wijzigingen.');}
 try{return restore(storage,incoming,prior);}
 catch(err){
   try{previousRecovery===null?storage.removeItem(RECOVERY):storage.setItem(RECOVERY,previousRecovery);}
   catch{throw Error('Import faalde en herstelkopie kon niet worden teruggezet. Controleer je lokale projectgegevens.');}
   throw err;
 }
}
function undoLastImport(storage,expectedSnapshot){
 const recovery=getRecovery(storage);
 if(!recovery)throw Error('Er is geen lokale herstelkopie beschikbaar');
 return restoreWithRecovery(storage,recovery.draft,expectedSnapshot);
}
return Object.freeze({EX,IN,NOTE,RECOVERY,validExterior,validInterior,create,parse,read,preview,snapshot,restore,getRecovery,restoreWithRecovery,undoLastImport});
});
