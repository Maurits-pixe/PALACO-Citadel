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
test('failed first write leaves unchanged values intact without unnecessary rollback',()=>{
 const storage=fakeStorage({[bundle.EX]:'old'});
 storage.setItem=(key,value)=>{if(key===bundle.IN||key===bundle.EX)throw Error('Persistent storage failure');};
 assert.throws(()=>bundle.restore(storage,bundle.create(exterior(),interior(),'new')),/oorspronkelijke opslag teruggezet/);
 assert.equal(storage.getItem(bundle.EX),'old');
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


test('recovery timestamp must be a real canonical UTC instant',()=>{
 const storage=fakeStorage();
 const draft=bundle.create(null,null,'safe');
 const base={schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'NONE',draft};
 for(const savedAt of ['2026-99-99T12:00:00.000Z','2026-02-30T12:00:00.000Z','2026-11-22Tnope','2026-11-22T12:00:00Z','2026-11-22T13:00:00.000+01:00','2026-11-22T12:00:00.000Zextra']){
  storage.setItem(bundle.RECOVERY,JSON.stringify({...base,savedAt}));
  assert.throws(()=>bundle.getRecovery(storage),/Ongeldig herstelmoment/,savedAt);
  assert.throws(()=>bundle.undoLastImport(storage),/Ongeldig herstelmoment/,savedAt);
  assert.equal(storage.getItem(bundle.NOTE),null);
 }
 storage.setItem(bundle.RECOVERY,JSON.stringify({...base,savedAt:'2026-11-22T12:00:00.000Z'}));
 assert.equal(bundle.getRecovery(storage).savedAt,'2026-11-22T12:00:00.000Z');
});


test('undo refuses a recovery point replaced between selection and verification',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'current'});
 const first={schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'NONE',savedAt:'2026-11-22T12:00:00.000Z',draft:bundle.create(null,null,'old')};
 const second={...first,savedAt:'2026-11-22T12:00:01.000Z',draft:bundle.create(null,null,'newer')};
 storage.setItem(bundle.RECOVERY,JSON.stringify(first));
 const get=storage.getItem;let reads=0;
 storage.getItem=key=>{
  if(key===bundle.RECOVERY&&++reads===2)storage.setItem(bundle.RECOVERY,JSON.stringify(second));
  return get(key);
 };
 assert.throws(()=>bundle.undoLastImport(storage,bundle.snapshot(storage)),/Herstelkopie gewijzigd/);
 assert.equal(storage.getItem(bundle.NOTE),'current');
 assert.equal(JSON.parse(storage.getItem(bundle.RECOVERY)).draft.note,'newer');
});

test('undo refuses recovery changes during preparation without touching designs',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'current'});
 const original={schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'NONE',savedAt:'2026-11-22T12:00:00.000Z',draft:bundle.create(null,null,'old')};
 const incoming={...original,savedAt:'2026-11-22T12:00:02.000Z',draft:bundle.create(null,null,'newer')};
 storage.setItem(bundle.RECOVERY,JSON.stringify(original));
 const get=storage.getItem;let reads=0;
 storage.getItem=key=>{
  if(key===bundle.RECOVERY&&++reads===4)storage.setItem(bundle.RECOVERY,JSON.stringify(incoming));
  return get(key);
 };
 assert.throws(()=>bundle.undoLastImport(storage,bundle.snapshot(storage)),/Herstelkopie gewijzigd/);
 assert.equal(storage.getItem(bundle.NOTE),'current');
 assert.equal(JSON.parse(storage.getItem(bundle.RECOVERY)).draft.note,'newer');
});


test('concurrent recovery replacement after save aborts before changing the design',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'untouched'});
 const rival={schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'NONE',savedAt:'2026-11-22T12:00:00.000Z',draft:bundle.create(null,null,'rival')};
 const baseSet=storage.setItem;
 storage.setItem=(key,value)=>{
  baseSet(key,value);
  if(key===bundle.RECOVERY)baseSet(key,JSON.stringify(rival));
 };
 assert.throws(()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'incoming')),/gewijzigd na opslaan/);
 assert.equal(storage.getItem(bundle.NOTE),'untouched');
 assert.equal(bundle.getRecovery(storage).draft.note,'rival');
});

test('failed design write never clobbers a competing recovery record',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'original'});
 const rival={schema:'palaco.citadel.atelier.recovery/1',state:'DRAFT',authority:'NONE',savedAt:'2026-11-22T12:00:00.000Z',draft:bundle.create(null,null,'rival')};
 const baseSet=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key===bundle.NOTE){
   baseSet(bundle.RECOVERY,JSON.stringify(rival));
   throw Error('Simulated write failure');
  }
  baseSet(key,value);
 };
 assert.throws(()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'incoming')),/herstelkopie is ondertussen gewijzigd/);
 assert.equal(storage.getItem(bundle.NOTE),'original');
 assert.equal(bundle.getRecovery(storage).draft.note,'rival');
});

test('rollback preserves a concurrent edit instead of clobbering it',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'before', [bundle.EX]:'original'});
 const set=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key===bundle.IN){
   set(bundle.EX,'edited in another tab');
   throw Error('write interrupted');
  }
  set(key,value);
 };
 assert.throws(()=>bundle.restore(storage,bundle.create(exterior(),interior(),'after')),/conflicteert met nieuwere gegevens/);
 assert.equal(storage.getItem(bundle.EX),'edited in another tab');
 assert.equal(storage.getItem(bundle.NOTE),'before');
});

test('rollback does not rewrite untouched keys after an early failure',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'original note'});
 const set=storage.setItem; const writes=[];
 storage.setItem=(key,value)=>{
  writes.push(key);
  if(key===bundle.EX)throw Error('quota');
  set(key,value);
 };
 assert.throws(()=>bundle.restore(storage,bundle.create(exterior(),interior(),'new')),/oorspronkelijke opslag teruggezet/);
 assert.deepEqual(writes,[bundle.EX]);
 assert.equal(storage.getItem(bundle.NOTE),'original note');
});


test('silent storage write failure cannot report successful project restoration',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'original note'});
 const originalSet=storage.setItem;
 storage.setItem=(key,value)=>{
   if(key===bundle.NOTE)return; // Simulate adapter that acknowledges but drops a write.
   originalSet(key,value);
 };
 assert.throws(
   ()=>bundle.restore(storage,bundle.create(exterior(),interior(),'new note')),
   /Herstel mislukt/
 );
 assert.equal(storage.getItem(bundle.EX),null);
 assert.equal(storage.getItem(bundle.IN),null);
 assert.equal(storage.getItem(bundle.NOTE),'original note');
});

test('readback detects competing modification and retains the competing value',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'original'});
 const originalGet=storage.getItem;
 let changed=false;
 storage.getItem=key=>{
   if(key===bundle.EX&&!changed&&originalGet(bundle.NOTE)==='imported'){
     changed=true;
     storage.map.set(bundle.EX,'concurrent-tab-edit');
   }
   return originalGet(key);
 };
 assert.throws(
   ()=>bundle.restore(storage,bundle.create(exterior(),interior(),'imported')),
   /conflicteert met nieuwere gegevens/
 );
 assert.equal(storage.getItem(bundle.EX),'concurrent-tab-edit');
 assert.equal(storage.getItem(bundle.IN),null);
 assert.equal(storage.getItem(bundle.NOTE),'original');
});

test('successful restore verifies its three intended storage values',()=>{
 const storage=fakeStorage({external:'preserved'});
 const design=exterior();
 design.cells[3]='garden';
 const result=bundle.restore(storage,bundle.create(design,null,'verified note'));
 assert.equal(result.exterior,true);
 assert.equal(result.interior,false);
 assert.equal(JSON.parse(storage.getItem(bundle.EX)).cells[3],'garden');
 assert.equal(storage.getItem(bundle.IN),null);
 assert.equal(storage.getItem(bundle.NOTE),'verified note');
 assert.equal(storage.getItem('external'),'preserved');
});


test('rollback diagnostics report restored and untouched sections without design content',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'private design note'});
 const set=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key===bundle.IN)throw Error('quota');
  set(key,value);
 };
 let failure;
 try{bundle.restore(storage,bundle.create(exterior(),interior(),'replacement'));}
 catch(err){failure=err;}
 assert.equal(failure.code,'ATELIER_RESTORE_ROLLED_BACK');
 assert.deepEqual(Object.fromEntries(Object.entries(failure.rollback)),{
  exterior:'restored',interior:'original',note:'untouched'
 });
 assert.equal(JSON.stringify(failure.rollback).includes('private design note'),false);
 assert.equal(storage.getItem(bundle.NOTE),'private design note');
});

test('rollback conflict reports review required and preserves another tab edit',()=>{
 const storage=fakeStorage({[bundle.EX]:'original',[bundle.NOTE]:'sensitive note'});
 const set=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key===bundle.IN){set(bundle.EX,'rival design content');throw Error('interrupted');}
  set(key,value);
 };
 let failure;
 try{bundle.restore(storage,bundle.create(exterior(),interior(),'replacement'));}
 catch(err){failure=err;}
 assert.equal(failure.code,'ATELIER_RESTORE_REVIEW_REQUIRED');
 assert.equal(failure.rollback.exterior,'conflict');
 assert.equal(failure.rollback.interior,'original');
 assert.equal(failure.rollback.note,'untouched');
 assert.equal(storage.getItem(bundle.EX),'rival design content');
 assert.equal(JSON.stringify(failure.rollback).includes('rival design content'),false);
});

test('silent rollback failure reports section as failed rather than restored',()=>{
 const storage=fakeStorage();
 const set=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key===bundle.IN)throw Error('no space');
  set(key,value);
 };
 const remove=storage.removeItem;
 storage.removeItem=key=>{if(key===bundle.EX)return;remove(key);};
 let failure;
 try{bundle.restore(storage,bundle.create(exterior(),interior(),'draft'));}
 catch(err){failure=err;}
 assert.equal(failure.code,'ATELIER_RESTORE_REVIEW_REQUIRED');
 assert.equal(failure.rollback.exterior,'failed');
 assert.equal(failure.rollback.note,'untouched');
 assert.notEqual(storage.getItem(bundle.EX),null);
});


test('recovery refuses a source note changed between capture and preparation',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'originele notitie'});
 const get=storage.getItem;let noteReads=0;
 storage.getItem=key=>{
  if(key===bundle.NOTE&&++noteReads===2){
   storage.map.set(bundle.NOTE,'wijziging vanuit ander tabblad');
  }
  return get(key);
 };
 assert.throws(
  ()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'import')),
  /gewijzigd tijdens voorbereiding/
 );
 assert.equal(storage.getItem(bundle.RECOVERY),null);
 assert.equal(storage.getItem(bundle.NOTE),'wijziging vanuit ander tabblad');
});

test('recovery draft is made from the verified captured source values',()=>{
 const saved=exterior();saved.cells[4]='garden';
 const storage=fakeStorage({
  [bundle.EX]:JSON.stringify(saved),
  [bundle.NOTE]:'eerst bewaard'
 });
 const original=storage.getItem;
 let exteriorReads=0;
 storage.getItem=key=>{
  if(key===bundle.EX)exteriorReads++;
  return original(key);
 };
 bundle.restoreWithRecovery(storage,bundle.create(null,null,'nieuwe schets'));
 const previous=bundle.getRecovery(storage);
 assert.equal(previous.draft.exterior.cells[4],'garden');
 assert.equal(previous.draft.note,'eerst bewaard');
 assert.equal(previous.draft.state,'DRAFT');
 assert.equal(previous.draft.authority,'NONE');
 assert.ok(exteriorReads>=2,'a second snapshot verifies freshness before import');
});


test('recovery write that commits before throwing is reversed without touching designs',()=>{
 const priorRecovery='vorige-herstelwaarde';
 const storage=fakeStorage({[bundle.NOTE]:'veilig ontwerp',[bundle.RECOVERY]:priorRecovery});
 const set=storage.setItem;
 let failed=false;
 storage.setItem=(key,value)=>{
  set(key,value);
  if(key===bundle.RECOVERY&&!failed){failed=true;throw Error('write acknowledged then failure');}
 };
 assert.throws(
  ()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'nieuw')),
  /Geen ruimte voor veilige herstelkopie/
 );
 assert.equal(storage.getItem(bundle.RECOVERY),priorRecovery);
 assert.equal(storage.getItem(bundle.NOTE),'veilig ontwerp');
});

test('recovery write error never overwrites a competing recovery value',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'veilig ontwerp'});
 const set=storage.setItem;
 storage.setItem=(key,value)=>{
  if(key===bundle.RECOVERY){
   set(key,'nieuwe herstelkopie vanuit andere tab');
   throw Error('write rejected');
  }
  set(key,value);
 };
 assert.throws(
  ()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'nieuw')),
  /ondertussen gewijzigd/
 );
 assert.equal(storage.getItem(bundle.RECOVERY),'nieuwe herstelkopie vanuit andere tab');
 assert.equal(storage.getItem(bundle.NOTE),'veilig ontwerp');
});

test('failed recovery cleanup does not claim successful rollback',()=>{
 const storage=fakeStorage({[bundle.NOTE]:'oud ontwerp'});
 const set=storage.setItem;
 storage.setItem=(key,value)=>{
  set(key,value);
  if(key===bundle.RECOVERY)throw Error('write then throw');
 };
 storage.removeItem=key=>{if(key!==bundle.RECOVERY)storage.map.delete(key);};
 assert.throws(
  ()=>bundle.restoreWithRecovery(storage,bundle.create(null,null,'nieuw')),
  /terugdraaien niet bevestigd/
 );
 assert.equal(storage.getItem(bundle.NOTE),'oud ontwerp');
 assert.notEqual(storage.getItem(bundle.RECOVERY),null);
});
