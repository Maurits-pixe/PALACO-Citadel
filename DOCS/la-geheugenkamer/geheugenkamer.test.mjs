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

function harness(){
  const nodes=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag;this.value='';this.checked=false;this.textContent='';this.children=[];this.dataset={};this.listeners=new Map();this.files=[];}
    addEventListener(type,fn){this.listeners.set(type,fn)}
    dispatch(type){const fn=this.listeners.get(type);if(!fn)throw Error('No '+type+' listener');return fn({preventDefault(){},target:this,currentTarget:this})}
    append(...kids){this.children.push(...kids)}
    replaceChildren(...kids){this.children=[...kids]}
    focus(){}
    reset(){for(const id of ['title','who','what','where','why','how','source'])nodes.get('#'+id).value='';nodes.get('#category').value='Persoonlijk'}
    click(){if(this.tagName==='a')this.clicked=true;else if(this.listeners.has('click'))return this.dispatch('click')}
  }
  const names=['message','count','utc','entryForm','persist','title','who','what','where','why','how','source','category','search','filter','sort','timeline','clear','export','importBtn','file'];
  for(const n of names)nodes.set('#'+n,new Element());
  nodes.get('#category').value='Persoonlijk';
  const storage=new Map(),intervals=[];
  const sandbox={
    document:{querySelector(sel){assert.ok(nodes.has(sel),'missing mock: '+sel);return nodes.get(sel)},createElement(tag){return new Element(tag)}},
    localStorage:{setItem(k,v){storage.set(k,v)},removeItem(k){storage.delete(k)},getItem(k){return storage.get(k)||null}},
    Blob:class{constructor(chunks,options){this.chunks=chunks;this.options=options}},
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
