import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest} from '../citadel-proof/proof.mjs';
import {ConfinedStore} from '../registration/storage.mjs';
const golden='8cf7c580a251f2f0290c1fe16fa071a9d37541698dcf5788cc493fe646cd733a';
test('same UTF-8 contract digest on Linux and Windows',()=>{
  assert.equal(digest({schema:'palaco.digest-parity/v1',tenant:'TENANT-A',text:'EVA · Pluto 🦆',sequence:42,items:[0,false,null,'é']}),golden);
});
test('Windows local storage remains explicitly blocked; Linux initializes private root',async t=>{
  const root=await mkdtemp(join(tmpdir(),'palaco-platform-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new ConfinedStore(root,root);
  if(process.platform==='win32')await assert.rejects(store.initialize(),/Windows ACL storage profile not verified/);
  else await store.initialize();
  assert.deepEqual(await readdir(root),[]);
});
test('Windows UNC and device namespace cannot bypass unsupported storage gate',async()=>{
  for(const path of ['\\\\server\\share\\palaco','\\\\?\\C:\\palaco','\\\\.\\C:\\palaco']){
    if(process.platform==='win32')await assert.rejects(new ConfinedStore(path,path).initialize(),/Windows ACL storage profile not verified/);
    else assert.throws(()=>new ConfinedStore(path,path),/absolute root/);
  }
});
