'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const py=path.join(__dirname,'github-artifact-zip-extract.py');
const make=(members)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palaco-zip-test-'));
 const archive=path.join(root,'sample.zip');
 const setup=spawnSync('python3',['-c',`
import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED) as z:
 for name,data in zip(sys.argv[2::2],sys.argv[3::2]):
  z.writestr(name,data)
`,archive,...members.flat()],{encoding:'utf8'});
 assert.equal(setup.status,0,setup.stderr);
 return {root,archive,out:path.join(root,'out')};
};
function fixture(members,fn){
 const x=make(members);
 try{fn(x);}finally{fs.rmSync(x.root,{force:true,recursive:true});}
}
const good=[['atelier-review-evidence.json','{"report":1}\n'],
 ['atelier-review-integrity.json','{"integrity":1}\n']];
test('valid ZIP extracts exactly the two expected JSON files',()=>fixture(good,({archive,out})=>{
 const r=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(fs.readdirSync(out).sort(),good.map(x=>x[0]).sort());
 assert.equal(fs.readFileSync(path.join(out,good[0][0]),'utf8'),good[0][1]);
}));
test('unrecognized and traversing member names fail without writing files',()=>{
 for(const members of [[...good,['../escape.json','x']],[
  ['../atelier-review-evidence.json','x'],good[1]],[
  good[0],good[0]]]){
  fixture(members,({archive,out})=>{
   const r=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
   assert.notEqual(r.status,0);
   assert.equal(fs.existsSync(out),false);
  });
 }
});
test('oversize and suspicious compression ratio are rejected',()=>fixture([
 ['atelier-review-evidence.json','a'.repeat(20001)],good[1]
],({archive,out})=>{
 const r=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.equal(fs.existsSync(out),false);
}));
test('preexisting extraction files cannot be overwritten',()=>fixture(good,({archive,out})=>{
 fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'atelier-review-evidence.json'),'existing');
 const r=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.equal(fs.readFileSync(path.join(out,'atelier-review-evidence.json'),'utf8'),'existing');
}));

test('symlink extraction directory is rejected without writing outside sandbox',()=>fixture(good,({root,archive,out})=>{
 const outside=path.join(root,'outside');
 fs.mkdirSync(outside);
 fs.symlinkSync(outside,out,'dir');
 const r=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/must not contain symlinks/);
 assert.deepEqual(fs.readdirSync(outside),[]);
}));
test('regular file as extraction destination is rejected',()=>fixture(good,({archive,out})=>{
 fs.writeFileSync(out,'not a directory');
 const r=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.equal(fs.readFileSync(out,'utf8'),'not a directory');
}));

test('symlinked parent of extraction destination is rejected',()=>fixture(good,({root,archive})=>{
 const outside=path.join(root,'outside');
 const linkedParent=path.join(root,'linked-parent');
 fs.mkdirSync(outside);
 fs.symlinkSync(outside,linkedParent,'dir');
 const output=path.join(linkedParent,'created');
 const r=spawnSync('python3',[py,archive,output],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/must not contain symlinks/);
 assert.deepEqual(fs.readdirSync(outside),[]);
}));

test('corrupt second ZIP member is rejected before either file is written',()=>fixture(good,({archive,out})=>{
 const bytes=fs.readFileSync(archive);
 const needle=Buffer.from('{"integrity":1}\\n');
 // Use stored ZIP payloads to locate and tamper the second member deterministically.
 const rewrite=spawnSync('python3',['-c',`
import sys,zipfile
p=sys.argv[1]
with zipfile.ZipFile(p,'w',compression=zipfile.ZIP_STORED) as z:
 z.writestr('atelier-review-evidence.json','{"report":1}\\n')
 z.writestr('atelier-review-integrity.json','{"integrity":1}\\n')
`,archive],{encoding:'utf8'});
 assert.equal(rewrite.status,0,rewrite.stderr);
 const payload=fs.readFileSync(archive);
 const at=payload.indexOf(Buffer.from('{"integrity":1}'));
 assert.ok(at>0);
 payload[at+3]^=1;
 fs.writeFileSync(archive,payload);
 const result=spawnSync('python3',[py,archive,out],{encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.equal(fs.existsSync(out),false);
}));
