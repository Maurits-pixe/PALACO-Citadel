'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const sandbox={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'regiekamer-bundle.js'),'utf8'),sandbox,{filename:'regiekamer-bundle.js'});
const bundle=sandbox.module.exports;
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
 assert.equal(saved.exterior.snapshots.length,0);
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

test('stale preview cannot overwrite changes made in another tab',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'original note'});
 const before=bundle.snapshot(storage);
 storage.setItem(bundle.NOTE,'updated in another tab');
 const draft=bundle.create(exterior(),interior(),'new import');
 assert.throws(()=>bundle.restore(storage,draft,before),/gewijzigd sinds de controle/);
 assert.equal(storage.getItem(bundle.NOTE),'updated in another tab');
 assert.equal(storage.getItem(bundle.EX),null);
 assert.equal(storage.getItem(bundle.IN),null);
});
test('matching preview snapshot allows restoration without unrelated writes',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'prior note',other:'keep'});
 const before=bundle.snapshot(storage);
 const draft=bundle.create(exterior(),interior(),'restored');
 const report=bundle.restore(storage,draft,before);
 assert.equal(report.exterior,true);
 assert.equal(report.interior,true);
 assert.equal(storage.getItem(bundle.NOTE),'restored');
 assert.equal(storage.getItem('other'),'keep');
});
test('invalid comparison snapshot is rejected before any writes',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'safe'});
 assert.throws(()=>bundle.restore(storage,bundle.create(null,null,''),['bad']),/gewijzigd sinds de controle/);
 assert.equal(storage.getItem(bundle.NOTE),'safe');
});

test('import preview reports changed cells, removals and note replacement without mutation',()=>{
 const current=exterior(), incoming=exterior();
 const inside=interior();
 current.cells[0]='park';current.cells[2]='royal';incoming.cells[0]='water';
 inside.floors[0][4]='salon';
 const before=bundle.create(current,inside,'original');
 const after=bundle.create(incoming,null,'new');
 const report=bundle.preview(before,after);
 assert.equal(report.exterior.changed,2);
 assert.equal(report.exterior.removed,1);
 assert.equal(report.floors[0].removed,1);
 assert.equal(report.removed,2);
 assert.equal(report.removesInterior,true);
 assert.equal(report.noteChanged,true);
 assert.equal(before.exterior.cells[0],'park');
 assert.equal(before.interior.floors[0][4],'salon');
});
test('preview rejects elevated authority and preserves absence without invented changes',()=>{
 const empty=bundle.create(null,null,'');
 const report=bundle.preview(empty,empty);
 assert.equal(report.changed,0);
 assert.equal(report.removed,0);
 assert.equal(report.noteChanged,false);
 assert.throws(()=>bundle.preview(empty,{...empty,authority:'OWNER'}));
});

test('confirmed import saves the previous DRAFT as a local recovery point',()=>{
 const storage=fakeStorage();
 const old=exterior(),incoming=exterior();old.cells[1]='park';incoming.cells[1]='water';
 storage.setItem(bundle.EX,JSON.stringify(old));
 storage.setItem(bundle.IN,JSON.stringify(interior()));
 storage.setItem(bundle.NOTE,'first');
 bundle.restoreWithRecovery(storage,bundle.create(incoming,interior(),'second'),bundle.snapshot(storage));
 assert.equal(JSON.parse(storage.getItem(bundle.EX)).cells[1],'water');
 const recovery=bundle.getRecovery(storage);
 assert.equal(recovery.draft.exterior.cells[1],'park');
 assert.equal(recovery.draft.note,'first');
 assert.equal(recovery.draft.authority,'NONE');
});
test('previous local project is recoverable and the current project becomes the rollback point',()=>{
 const storage=fakeStorage();
 const old=exterior(),incoming=exterior();old.cells[1]='park';incoming.cells[1]='water';
 storage.setItem(bundle.EX,JSON.stringify(old));
 storage.setItem(bundle.NOTE,'before');
 bundle.restoreWithRecovery(storage,bundle.create(incoming,null,'after'));
 bundle.undoLastImport(storage,bundle.snapshot(storage));
 assert.equal(JSON.parse(storage.getItem(bundle.EX)).cells[1],'park');
 assert.equal(storage.getItem(bundle.NOTE),'before');
 assert.equal(bundle.getRecovery(storage).draft.exterior.cells[1],'water');
});
test('stale snapshot or corrupt local source never overwrites prior work',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'first'});
 const expected=bundle.snapshot(storage);
 storage.setItem(bundle.NOTE,'updated by another tab');
 assert.throws(()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'incoming'),expected),/gewijzigd/);
 assert.equal(storage.getItem(bundle.NOTE),'updated by another tab');
 assert.equal(storage.getItem(bundle.RECOVERY),null);
 storage.setItem(bundle.EX,'not json');
 assert.throws(()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'new')),/onleesbare/);
 assert.equal(storage.getItem(bundle.EX),'not json');
});
test('recovery quota failure blocks import without changing the current project',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'original'});
 const setter=storage.setItem;storage.setItem=(key,value)=>{if(key===bundle.RECOVERY)throw Error('quota');setter(key,value);};
 assert.throws(()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'incoming')),/Geen ruimte/);
 assert.equal(storage.getItem(bundle.NOTE),'original');
});
test('invalid or elevated authority recovery record cannot be used to roll back',()=>{
 const storage=fakeStorage();
 const good=bundle.create(null,null,'');
 storage.setItem(bundle.RECOVERY,JSON.stringify({schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'OWNER',savedAt:new Date().toISOString(),draft:good}));
 assert.throws(()=>bundle.getRecovery(storage),/Onbekende/);
 assert.throws(()=>bundle.undoLastImport(storage),/Onbekende/);
});
