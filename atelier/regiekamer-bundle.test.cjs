'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bundle=require('./regiekamer-bundle.js');
const exterior=()=>({schema:'palaco.citadel.atelier.studio/1',state:'DRAFT',authority:'NONE',name:'L.A.',scale:'Dorp',style:'PALACO · Emerald & Gold',mood:'Gouden uur',cells:Array(96).fill(null)});
const interior=()=>({schema:'palaco.citadel.atelier.interior/1',state:'DRAFT',authority:'NONE',name:'Interieur',material:'Smaragd & goud',mood:'Gouden avond',floors:[Array(80).fill(null),Array(80).fill(null),Array(80).fill(null)]});
function fakeStorage(initial={}){
 const map=new Map(Object.entries(initial));
 return {map,getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}
test('round-trip preserves both designs and the note as creative DRAFT only',()=>{
 const e=exterior(),i=interior();e.cells[3]='water';i.floors[2][14]='library';
 const saved=bundle.parse(JSON.stringify(bundle.create(e,i,'Gold & Emerald')));
 assert.equal(saved.exterior.cells[3],'water');
 assert.equal(saved.interior.floors[2][14],'library');
 assert.equal(saved.note,'Gold & Emerald');
 assert.equal(saved.authority,'NONE');
 assert.deepEqual(saved.exterior.snapshots,[]);
});
test('rejects active projects, role claims, unknown zones, missing fields and large payloads',()=>{
 const e=exterior(),i=interior(),valid=bundle.create(e,i,'note');
 assert.throws(()=>bundle.parse(JSON.stringify({...valid,authority:'OWNER'})));
 assert.throws(()=>bundle.parse(JSON.stringify({...valid,exterior:{...e,state:'ACTIVE'}})));
 assert.throws(()=>bundle.parse(JSON.stringify({...valid,interior:{...i,floors:[Array(80).fill('x'),i.floors[1],i.floors[2]]}})));
 const withoutNote={...valid};delete withoutNote.note;
 assert.throws(()=>bundle.parse(JSON.stringify(withoutNote)));
 assert.throws(()=>bundle.parse('x'.repeat(150001)));
});
test('restore replaces exactly local atelier keys and leaves unrelated entries untouched',()=>{
 const storage=fakeStorage({untouched:'value'});
 const e=exterior(),i=interior();e.cells[9]='park';i.floors[1][7]='gallery';
 bundle.restore(storage,bundle.create(e,i,'Design statement'));
 assert.equal(storage.getItem('untouched'),'value');
 assert.equal(JSON.parse(storage.getItem(bundle.EX)).cells[9],'park');
 assert.equal(JSON.parse(storage.getItem(bundle.IN)).floors[1][7],'gallery');
 assert.equal(storage.getItem(bundle.NOTE),'Design statement');
});
test('one-off failed write rolls back all three original values',()=>{
 const storage=fakeStorage({[bundle.EX]:'prior exterior',[bundle.IN]:'prior interior',[bundle.NOTE]:'prior note'});
 const baseSet=storage.setItem;let failOnce=true;
 storage.setItem=(key,value)=>{if(key===bundle.IN&&failOnce){failOnce=false;throw Error('Quota exceeded');}baseSet(key,value);};
 assert.throws(()=>bundle.restore(storage,bundle.create(exterior(),interior(),'new note')),/teruggezet/);
 assert.equal(storage.getItem(bundle.EX),'prior exterior');
 assert.equal(storage.getItem(bundle.IN),'prior interior');
 assert.equal(storage.getItem(bundle.NOTE),'prior note');
});
test('persistent write failure explicitly reports incomplete rollback',()=>{
 const storage=fakeStorage({[bundle.EX]:'old'});
 storage.setItem=(key,value)=>{if(key===bundle.IN||key===bundle.EX)throw Error('Persistent storage failure');};
 assert.throws(()=>bundle.restore(storage,bundle.create(exterior(),interior(),'new')),/terugdraaien mislukt/);
});
