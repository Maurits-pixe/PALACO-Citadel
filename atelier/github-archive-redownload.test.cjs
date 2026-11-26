'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {NAMES,buildManifest}=require('./github-archive-manifest.cjs');
const {verifyDownloaded}=require('./github-archive-redownload.cjs');
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,headSha:'a'.repeat(40),runId:123,attempt:1,artifactId:456};
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function makeFiles(){
 const base={repository:ctx.repository,artifact_id:456,decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false};
 return {
 [NAMES[0]]:json({...base,head_sha:ctx.headSha,run_id:123}),
 [NAMES[1]]:json({...base,candidate_sha:ctx.headSha,workflow_run_id:123,workflow_run_attempt:1,pr_number:60}),
 [NAMES[2]]:json({...base,candidate_sha:ctx.headSha,run_id:123}),
 [NAMES[3]]:json({...base,candidate_sha:ctx.headSha,run_id:123,run_attempt:1,pr_number:60})
 };
}
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-redownload-'));
 const original=path.join(root,'original'),downloaded=path.join(root,'downloaded');
 fs.mkdirSync(original);fs.mkdirSync(downloaded);
 const files=makeFiles();
 files['atelier-archive-manifest.json']=json(buildManifest(files,ctx));
 for(const [name,bytes] of Object.entries(files)){
  fs.writeFileSync(path.join(original,name),bytes);
  fs.writeFileSync(path.join(downloaded,name),bytes);
 }
 return {root,original,downloaded};
}
function scenario(fn){
 const f=setup();
 try{fn(f);}finally{fs.rmSync(f.root,{recursive:true,force:true});}
}
test('downloaded five-file archive verifies and remains HOLD/DENY',()=>scenario(({original,downloaded})=>{
 const result=verifyDownloaded(original,downloaded,ctx);
 assert.equal(result.result,'FIVE_FILES_REDOWNLOADED_AND_VERIFIED');
 assert.equal(result.release_approved,false);
 assert.equal(result.publication,'DENY');
}));
test('changed downloaded diagnostic or manifest fails closed',()=>scenario(({original,downloaded})=>{
 fs.appendFileSync(path.join(downloaded,NAMES[0]),' ');
 assert.throws(()=>verifyDownloaded(original,downloaded,ctx));
}));
test('missing and unexpected archive members fail closed',()=>scenario(({original,downloaded})=>{
 fs.unlinkSync(path.join(downloaded,NAMES[2]));
 assert.throws(()=>verifyDownloaded(original,downloaded,ctx),/member set/);
 fs.copyFileSync(path.join(original,NAMES[2]),path.join(downloaded,NAMES[2]));
 fs.writeFileSync(path.join(downloaded,'rogue.json'),'{}');
 assert.throws(()=>verifyDownloaded(original,downloaded,ctx),/member set/);
}));
test('replayed context and forged approval fail closed',()=>scenario(({original,downloaded})=>{
 assert.throws(()=>verifyDownloaded(original,downloaded,{...ctx,artifactId:789}));
 const file=path.join(downloaded,'atelier-archive-manifest.json');
 const forged=JSON.parse(fs.readFileSync(file));
 forged.release_approved=true;
 fs.writeFileSync(file,json(forged));
 assert.throws(()=>verifyDownloaded(original,downloaded,ctx));
}));
test('symlinked downloaded diagnostic is rejected',()=>scenario(({original,downloaded})=>{
 const target=path.join(downloaded,NAMES[1]);
 fs.unlinkSync(target);
 fs.symlinkSync(path.join(original,NAMES[1]),target);
 assert.throws(()=>verifyDownloaded(original,downloaded,ctx),/ELOOP|symbolic link|symlink/i);
}));
