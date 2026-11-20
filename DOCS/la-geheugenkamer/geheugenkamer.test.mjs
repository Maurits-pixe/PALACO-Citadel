import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(resolve(here,'index.html'),'utf8');
const root=readFileSync(resolve(here,'../../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'embedded Geheugenkamer application script exists');

function harness(initialArchive=null){
  const nodes=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag;this.value='';this.checked=false;this.textContent='';this.children=[];this.dataset={};this.listeners=new Map();this.files=[];this.attributes={};}
    addEventListener(type,fn){this.listeners.set(type,fn)}
    dispatch(type){const fn=this.listeners.get(type);if(!fn)throw Error('No '+type+' listener');return fn({preventDefault(){},target:this,currentTarget:this})}
    append(...kids){this.children.push(...kids)}
    replaceChildren(...kids){this.children=[...kids]}
    setAttribute(name,value){this.attributes[name]=value}
    focus(){}
    reset(){for(const id of ['title','who','what','where','why','how','source'])nodes.get('#'+id).value='';nodes.get('#category').value='Persoonlijk'}
    click(){if(this.tagName==='a')this.clicked=true;else if(this.listeners.has('click'))return this.dispatch('click')}
  }
  const names=['message','count','utc','entryForm','persist','title','who','what','where','why','how','source','category','search','filter','sort','timeline','collections','dossier','dossierDetails','dossierExport','dossierClose','handoffConsent','contractExport','clear','restore','proof','export','encryptedExport','archivePassphrase','vaultSave','vaultUnlock','vaultLock','vaultDelete','vaultStatus','importBtn','file'];
  for(const n of names)nodes.set('#'+n,new Element());
  nodes.get('#category').value='Persoonlijk';
  const storage=new Map(),intervals=[];if(initialArchive!==null)storage.set('palaco.citadel.geheugenkamer.v1',JSON.stringify(initialArchive));
  const sandbox={
    document:{querySelector(sel){assert.ok(nodes.has(sel),'missing mock: '+sel);return nodes.get(sel)},createElement(tag){return new Element(tag)}},
    localStorage:{setItem(k,v){storage.set(k,v)},removeItem(k){storage.delete(k)},getItem(k){return storage.get(k)||null}},
    Blob:class{constructor(chunks,options){this.chunks=chunks;this.options=options;sandbox.latestBlob=this}},
    URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},
    setTimeout(){},setInterval(fn){intervals.push(fn)},confirm(){return true},
    crypto:{randomUUID:(()=>{let i=0;return ()=> 'test-id-'+(++i)})()},
    Date,Math,JSON,Number,Array,String,Set,
  };
  vm.runInNewContext(script,sandbox,{timeout:1000});
  return {nodes,storage,sandbox};
}
function enter(h,title){for(const [id,val] of Object.entries({title,who:'Een bezoeker',what:'Een herinnering',where:'Locus Amoenus',why:'Betekenis',how:'Eigen waarneming',source:'Lokale bron',category:'Persoonlijk'}))h.nodes.get('#'+id).value=val;h.nodes.get('#entryForm').dispatch('submit');}

test('nav link exists and all original root navigation anchors survive',()=>{
 assert.match(root,/href="\/DOCS\/la-geheugenkamer\/"/);
 for(const path of ['#launch-pad','#rio-platform','#compass-dashboard','/atelier/wizard.html','/DOCS/levensader-readonly/'])assert.ok(root.includes('href="'+path+'"'));
});
test('runtime renders empty archive and never writes to local storage by default',()=>{
 const h=harness();assert.equal(h.nodes.get('#count').textContent,0);assert.equal(h.storage.size,0);
 enter(h,'Eerste herinnering');assert.equal(h.nodes.get('#count').textContent,1);assert.equal(h.storage.size,0);
});
test('opt-in writes and opt-out erases localStorage',()=>{
 const h=harness();enter(h,'Lokaal');
 h.nodes.get('#persist').checked=true;h.nodes.get('#persist').dispatch('change');
 assert.equal(JSON.parse(h.storage.values().next().value).length,1);
 h.nodes.get('#persist').checked=false;h.nodes.get('#persist').dispatch('change');
 assert.equal(h.storage.size,0);
});
test('versioning adds a new item without overwriting predecessor',()=>{
 const h=harness();enter(h,'V1');
 const first=h.nodes.get('#timeline').children[0];
 const edit=first.children.at(-1).children[0];edit.dispatch('click');
 h.nodes.get('#title').value='V2';
 h.nodes.get('#entryForm').dispatch('submit');
 assert.equal(h.nodes.get('#count').textContent,2);
 assert.equal(h.nodes.get('#timeline').children[0].children[0].textContent.includes('versie 2'),true);
});
test('search filters and clear action removes entries',()=>{
 const h=harness();enter(h,'Bloem');enter(h,'Ster');
 h.nodes.get('#search').value='bloem';h.nodes.get('#search').dispatch('input');
 assert.equal(h.nodes.get('#timeline').children.length,1);
 h.nodes.get('#clear').dispatch('click');
 assert.equal(h.nodes.get('#count').textContent,0);
});
test('JSON import refuses malformed, duplicate and oversized files',async()=>{
 const h=harness(),file=h.nodes.get('#file');
 for(const item of [
 {size:300*1024,text:async()=>'{ }'},
 {size:15,text:async()=>'{invalid'},
 {size:100,text:async()=>JSON.stringify({schema:'PALACO-CITADEL-GEHEUGEN-1',entries:[{id:'x'}]})}
 ]){
 file.files=[item];await file.dispatch('change');
 assert.equal(h.nodes.get('#count').textContent,0);
 assert.match(h.nodes.get('#message').textContent,/geweigerd/);
 }
});
test('import untrusted text never becomes markup',async()=>{
 const h=harness(),file=h.nodes.get('#file');
 const sample={id:'entry-x',createdAt:new Date().toISOString(),previousId:'',version:1,trust:'SELF_REPORTED_NOT_VERIFIED',title:'<img src=x onerror=alert(1)>',who:'W',what:'X',where:'',why:'',how:'',source:'',category:'Persoonlijk'};
 file.files=[{size:500,text:async()=>JSON.stringify({schema:'PALACO-CITADEL-GEHEUGEN-1',entries:[sample]})}];
 await file.dispatch('change');
 assert.equal(h.nodes.get('#count').textContent,1);
 assert.equal(h.nodes.get('#timeline').children[0].children[1].textContent,sample.title);
});

test('previously stored archive only restores after explicit click',()=>{
 const seed={id:'restored-1',createdAt:'2026-11-17T12:00:00.000Z',previousId:'',version:1,trust:'SELF_REPORTED_NOT_VERIFIED',title:'Herinnering',who:'W',what:'Tekst',where:'',why:'',how:'',source:'',category:'Persoonlijk'};
 const h=harness([seed]);
 assert.equal(h.nodes.get('#count').textContent,0);
 h.nodes.get('#restore').dispatch('click');
 assert.equal(h.nodes.get('#count').textContent,1);
 assert.equal(h.nodes.get('#persist').checked,true);
});
test('Bewijskamer draft export is not an official attestation',()=>{
 const h=harness();enter(h,'Bewijsconcept');
 h.nodes.get('#proof').dispatch('click');
 const data=JSON.parse(h.sandbox.latestBlob.chunks[0]);
 assert.equal(data.schema,'PALACO-CITADEL-BEWIJSKAMER-DRAFT-1');
 assert.equal(data.authority,'NONE');
 assert.equal(data.edtrIssued,false);
 assert.equal(data.records.length,1);
 assert.equal(data.records[0].trust,'SELF_REPORTED_NOT_VERIFIED');
});
test('reject imported self-referential lineage',async()=>{
 const h=harness(),file=h.nodes.get('#file');
 const sample={id:'cycle',createdAt:'2026-11-17T12:00:00.000Z',previousId:'cycle',version:2,trust:'SELF_REPORTED_NOT_VERIFIED',title:'Cyclisch',who:'W',what:'X',where:'',why:'',how:'',source:'',category:'Persoonlijk'};
 file.files=[{size:500,text:async()=>JSON.stringify({schema:'PALACO-CITADEL-GEHEUGEN-1',entries:[sample]})}];
 await file.dispatch('change');
 assert.equal(h.nodes.get('#count').textContent,0);
 assert.match(h.nodes.get('#message').textContent,/geweigerd/);
});

test('local collection overview counts records and filters without data transfer',()=>{
 const h=harness();enter(h,'Eerste');
 assert.equal(h.nodes.get('#collections').children.length,5);
 assert.equal(h.nodes.get('#collections').children[0].textContent,'Persoonlijk · 1');
 const button=h.nodes.get('#collections').children.find(x=>x.textContent==='Atelier · 0');
 button.dispatch('click');
 assert.equal(h.nodes.get('#filter').value,'Atelier');
 assert.equal(h.nodes.get('#timeline').children.length,1);
 assert.match(h.nodes.get('#timeline').children[0].textContent,/Geen herinneringen/);
});
test('no new record is created when an edited predecessor disappeared',()=>{
 const h=harness();enter(h,'Oorspronkelijk');
 h.nodes.get('#timeline').children[0].children.at(-1).children[0].dispatch('click');
 h.nodes.get('#clear').dispatch('click');
 h.nodes.get('#title').value='Verdwenen voorganger';
 h.nodes.get('#entryForm').dispatch('submit');
 assert.equal(h.nodes.get('#count').textContent,0);
 assert.match(h.nodes.get('#message').textContent,/afgebroken/);
});

test('dossier inspector displays source and unverified lineage in local context',()=>{
 const h=harness();enter(h,'Eerste dossier');
 const inspect=h.nodes.get('#timeline').children[0].children.at(-1).children[1];
 inspect.dispatch('click');
 const details=h.nodes.get('#dossierDetails').children.map(x=>x.textContent).join('\n');
 assert.match(details,/Bron: Lokale bron/);
 assert.match(details,/SELF_REPORTED_NOT_VERIFIED/);
 assert.match(details,/Versie 1/);
 assert.match(details,/EDTR: HOLD/);
});
test('selected dossier export cannot claim official issuance',()=>{
 const h=harness();enter(h,'Versie 1');
 h.nodes.get('#timeline').children[0].children.at(-1).children[0].dispatch('click');
 h.nodes.get('#title').value='Versie 2';
 h.nodes.get('#entryForm').dispatch('submit');
 h.nodes.get('#timeline').children[0].children.at(-1).children[1].dispatch('click');
 h.nodes.get('#dossierExport').dispatch('click');
 const doc=JSON.parse(h.sandbox.latestBlob.chunks[0]);
 assert.equal(doc.schema,'PALACO-CITADEL-DOSSIER-DRAFT-1');
 assert.equal(doc.authority,'NONE');
 assert.equal(doc.edtrIssued,false);
 assert.deepEqual(Array.from(doc.records,x=>x.version),[1,2]);
});
test('clearing memory invalidates selected dossier and blocks stale export',()=>{
 const h=harness();enter(h,'Tijdelijk');
 h.nodes.get('#timeline').children[0].children.at(-1).children[1].dispatch('click');
 h.nodes.get('#clear').dispatch('click');
 assert.equal(h.nodes.get('#dossier').className,'panel hidden');
 h.nodes.get('#dossierExport').dispatch('click');
 assert.match(h.nodes.get('#message').textContent,/Geen dossier geselecteerd/);
});

test('handoff without explicit selection consent remains blocked',()=>{
 const h=harness();enter(h,'Geen toestemming');
 h.nodes.get('#timeline').children[0].children.at(-1).children[1].dispatch('click');
 h.nodes.get('#contractExport').dispatch('click');
 assert.equal(h.sandbox.latestBlob,undefined);
 assert.match(h.nodes.get('#message').textContent,/toestemming ontbreekt/);
});
test('handoff contains draft-only trust and one-time consent, never authority',()=>{
 const h=harness();enter(h,'Handoff');
 h.nodes.get('#timeline').children[0].children.at(-1).children[1].dispatch('click');
 h.nodes.get('#handoffConsent').checked=true;
 h.nodes.get('#contractExport').dispatch('click');
 const obj=JSON.parse(h.sandbox.latestBlob.chunks[0]);
 assert.equal(obj.schema,'PALACO-CITADEL-HANDOFF-DRAFT-1');
 assert.equal(obj.destination.mode,'MANUAL_FILE_TRANSFER_ONLY');
 assert.equal(obj.consent.scope,'ONE_LOCAL_EXPORT');
 assert.equal(obj.trust.authority,'NONE');
 assert.equal(obj.trust.edtrIssued,false);
 assert.equal(obj.trust.sourceVerified,false);
 assert.equal(obj.trust.clockAttested,false);
 assert.equal(obj.lineage.length,1);
 assert.equal(h.nodes.get('#handoffConsent').checked,false);
});
test('selecting a different dossier cancels earlier export consent',()=>{
 const h=harness();enter(h,'Eerste');enter(h,'Tweede');
 h.nodes.get('#timeline').children[0].children.at(-1).children[1].dispatch('click');
 h.nodes.get('#handoffConsent').checked=true;
 h.nodes.get('#timeline').children[1].children.at(-1).children[1].dispatch('click');
 assert.equal(h.nodes.get('#handoffConsent').checked,false);
 h.nodes.get('#contractExport').dispatch('click');
 assert.equal(h.sandbox.latestBlob,undefined);
});

test('incomplete restored lineage is visibly flagged without claiming authenticity',()=>{
 const orphan={id:'orphan-ui-v2',createdAt:'2026-11-17T12:00:00.000Z',previousId:'missing-parent-ui',version:2,trust:'SELF_REPORTED_NOT_VERIFIED',title:'Gedeeltelijk dossier',who:'W',what:'Onvolledig',where:'',why:'',how:'',source:'',category:'Persoonlijk'};
 const h=harness([orphan]);
 h.nodes.get('#restore').dispatch('click');
 assert.equal(h.nodes.get('#count').textContent,1);
 const card=h.nodes.get('#timeline').children[0];
 assert.ok(card.children.some(x=>x.textContent.includes('Lineage onvolledig')));
 card.children.at(-1).children[1].dispatch('click');
 const details=h.nodes.get('#dossierDetails').children.map(x=>x.textContent).join('\n');
 assert.match(details,/Lineage-status: ONVOLLEDIG/);
 assert.match(details,/Onbekende voorganger: missing-parent-ui/);
 assert.match(details,/Verificatie: NIET UITGEVOERD/);
 assert.match(details,/EDTR: HOLD/);
});
test('complete root-to-successor lineage is marked only locally complete',()=>{
 const h=harness();enter(h,'Lineage root');
 h.nodes.get('#timeline').children[0].children.at(-1).children[0].dispatch('click');
 h.nodes.get('#title').value='Lineage successor';
 h.nodes.get('#entryForm').dispatch('submit');
 const card=h.nodes.get('#timeline').children[0];
 assert.ok(card.children.some(x=>x.textContent.includes('Lineage lokaal compleet')));
 card.children.at(-1).children[1].dispatch('click');
 const details=h.nodes.get('#dossierDetails').children.map(x=>x.textContent).join('\n');
 assert.match(details,/Lineage-status: VOLLEDIG IN DIT LOKALE ARCHIEF/);
 assert.match(details,/herkomst niet geverifieerd/);
 assert.doesNotMatch(details,/Onbekende voorganger/);
});
