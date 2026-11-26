'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build,check}=require('./github-custody-handoff.cjs');
const ctx={repository:'Maurits-pixe/PALACO-Citadel',prNumber:60,headSha:'a'.repeat(40),runId:42,attempt:1,artifactId:10,diagnosticArtifactId:11};
const zip=Buffer.from('synthetic archive for test');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const manifest=()=>encode({schema:'palaco.citadel.atelier.archive-manifest/1',repository:ctx.repository,
 pr_number:60,candidate_sha:ctx.headSha,run_id:42,run_attempt:1,artifact_id:10,
 result:'FOUR_DIAGNOSTICS_BOUND',files:[{name:'a'},{name:'b'},{name:'c'},{name:'d'}],
 decision:'HOLD',publication:'DENY',release_approved:false,evidence_usable:false});
test('portable receipt is deterministic and never claims external custody',()=>{
 const m=manifest(),r=build(zip,m,ctx);
 assert.deepEqual(check(encode(r),zip,m,ctx),r);
 assert.equal(r.custody_state,'NOT_EXTERNALLY_ACKNOWLEDGED');
 assert.equal(r.release_approved,false);
});
test('archive byte mutation fails verification',()=>{
 const m=manifest(),r=encode(build(zip,m,ctx));
 assert.throws(()=>check(r,Buffer.from('modified zip'),m,ctx),/differs/);
});
test('manifest byte mutation fails verification',()=>{
 const m=manifest(),r=encode(build(zip,m,ctx));
 assert.throws(()=>check(r,zip,Buffer.concat([m,Buffer.from(' ')]),ctx),/Invalid|canonical/);
});
test('replayed SHA, run, attempt, artifact and PR are refused',()=>{
 const m=manifest(),r=encode(build(zip,m,ctx));
 for(const changed of [{headSha:'b'.repeat(40)},{runId:43},{attempt:2},
  {artifactId:12},{diagnosticArtifactId:13},{prNumber:61}])
  assert.throws(()=>check(r,zip,m,{...ctx,...changed}),/mismatch|differs/);
});
test('forged external acceptance or approval is refused',()=>{
 const m=manifest(),r=build(zip,m,ctx);
 assert.throws(()=>check(encode({...r,custody_state:'EXTERNALLY_ACKNOWLEDGED'}),zip,m,ctx),/differs/);
 assert.throws(()=>check(encode({...r,release_approved:true}),zip,m,ctx),/differs/);
});
