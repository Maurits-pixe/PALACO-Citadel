'use strict';
// v7.03: portable, non-authoritative archive custody handoff.
// A handoff is NOT an external acceptance or signature.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {loadBounded}=require('./github-diagnostic-zip-verify.cjs');
const SHA=/^[a-f0-9]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POS=n=>Number.isSafeInteger(n)&&n>0;
const HASH=b=>crypto.createHash('sha256').update(b).digest('hex');
const LIMIT='Portable integrity handoff only; external receipt, independent signer, custody transfer and release authorization are NOT established';
function context(ctx){
 if(!ctx||!REPO.test(ctx.repository||'')||!SHA.test(ctx.headSha||'')||
 !POS(ctx.prNumber)||!POS(ctx.runId)||!POS(ctx.attempt)||
 !POS(ctx.artifactId)||!POS(ctx.diagnosticArtifactId))throw Error('Invalid handoff identity context');
}
function verifyManifestBytes(raw,ctx){
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>20000)throw Error('Invalid manifest bytes');
 const parsed=JSON.parse(raw.toString('utf8'));
 if(!raw.equals(Buffer.from(JSON.stringify(parsed,null,2)+'\n'))||
 parsed.schema!=='palaco.citadel.atelier.archive-manifest/1'||
 parsed.repository!==ctx.repository||parsed.pr_number!==ctx.prNumber||
 parsed.candidate_sha!==ctx.headSha||parsed.run_id!==ctx.runId||
 parsed.run_attempt!==ctx.attempt||parsed.artifact_id!==ctx.artifactId||
 parsed.result!=='FOUR_DIAGNOSTICS_BOUND'||
 !Array.isArray(parsed.files)||parsed.files.length!==4||
 parsed.decision!=='HOLD'||parsed.publication!=='DENY'||
 parsed.release_approved!==false||parsed.evidence_usable!==false)
 throw Error('Manifest is not canonical or mismatches handoff context');
 return parsed;
}
function build(zip,manifest,ctx){
 context(ctx);
 if(!Buffer.isBuffer(zip)||zip.length<1||zip.length>200000)throw Error('Invalid archive ZIP');
 verifyManifestBytes(manifest,ctx);
 return {schema:'palaco.citadel.atelier.custody-handoff/1',
 result:'PORTABLE_HANDOFF_PREPARED',repository:ctx.repository,
 pr_number:ctx.prNumber,candidate_sha:ctx.headSha,run_id:ctx.runId,
 run_attempt:ctx.attempt,source_artifact_id:ctx.artifactId,
 diagnostic_artifact_id:ctx.diagnosticArtifactId,
 archive_zip_bytes:zip.length,archive_zip_sha256:HASH(zip),
 archive_manifest_bytes:manifest.length,archive_manifest_sha256:HASH(manifest),
 custody_state:'NOT_EXTERNALLY_ACKNOWLEDGED',decision:'HOLD',
 publication:'DENY',release_approved:false,evidence_usable:false,
 limitation:LIMIT};
}
function check(receipt,zip,manifest,ctx){
 if(!Buffer.isBuffer(receipt)||receipt.length<1||receipt.length>20000)
 throw Error('Invalid custody handoff receipt');
 const parsed=JSON.parse(receipt.toString('utf8'));
 const expected=build(zip,manifest,ctx);
 if(!receipt.equals(Buffer.from(JSON.stringify(parsed,null,2)+'\n'))||
 JSON.stringify(parsed)!==JSON.stringify(expected))
 throw Error('Transferred ZIP/manifest differs from recorded handoff');
 return expected;
}
function main(args,env=process.env){
 if(args.length!==4||!['create','verify'].includes(args[0]))
 throw Error('Usage: node github-custody-handoff.cjs create|verify ZIP MANIFEST RECEIPT');
 const ctx={repository:env.GITHUB_REPOSITORY,prNumber:Number(env.PALACO_PR_NUMBER),
 headSha:env.PALACO_EXPECTED_HEAD_SHA,runId:Number(env.GITHUB_RUN_ID),
 attempt:Number(env.GITHUB_RUN_ATTEMPT),artifactId:Number(env.PALACO_ARTIFACT_ID),
 diagnosticArtifactId:Number(env.PALACO_DIAGNOSTIC_ARCHIVE_ID)};
 const zip=loadBounded(args[1],200000),manifest=loadBounded(args[2],20000);
 const report=args[0]==='create'?build(zip,manifest,ctx):
 check(loadBounded(args[3],20000),zip,manifest,ctx);
 if(args[0]==='create')fs.writeFileSync(args[3],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 return report;
}
if(require.main===module){
 try{main(process.argv.slice(2));}
 catch(e){process.stderr.write('Custody handoff denied: '+e.message+'\n');process.exitCode=1;}
}
module.exports={build,check,main,LIMIT};
