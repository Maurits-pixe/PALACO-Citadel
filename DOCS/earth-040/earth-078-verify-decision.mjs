// EARTH-078: server/CI-side Ed25519 decision verification, not browser authorization.
// Trust anchors are caller-supplied out-of-band. Never trust keys inside a dossier.
import {createHash, verify, createPublicKey} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assessGISReviewDossier} from './earth-077-review-dossier.mjs';
const HEX=/^[a-f0-9]{64}$/;
const B64=/^[A-Za-z0-9+/]{86}==$/;
export function canonicalDecision({sourceSHA256,outputSHA256,reviewerId,decision}) {
  if(!HEX.test(sourceSHA256)||!HEX.test(outputSHA256)||typeof reviewerId!=='string'||!reviewerId.trim()||decision!=='ACCEPT') throw Error('INVALID_DECISION');
  return Buffer.from(JSON.stringify({protocol:'EARTH-078-v1',sourceSHA256,outputSHA256,reviewerId,decision}),'utf8');
}
export async function verifyGISDecision({dossier,sourcePath,outputPath,signature,trustAnchors}) {
  const assessment=assessGISReviewDossier(dossier);
  const failures=assessment.reasons.filter(x=>x!=='INDEPENDENT_SIGNATURE_VERIFICATION_REQUIRED');
  if(failures.length) return {status:'HOLD',reasons:failures};
  const reviewerId=dossier.review.reviewerId;
  const pem=trustAnchors instanceof Map?trustAnchors.get(reviewerId):undefined;
  if(typeof pem!=='string'||!B64.test(signature??'')) return {status:'HOLD',reasons:['TRUST_ANCHOR_OR_SIGNATURE_MISSING']};
  try {
    const [source,output]=await Promise.all([readFile(sourcePath),readFile(outputPath)]);
    const sha=b=>createHash('sha256').update(b).digest('hex');
    if(sha(source)!==dossier.source.sha256||sha(output)!==dossier.conversion.outputSHA256) return {status:'HOLD',reasons:['ARTIFACT_DIGEST_MISMATCH']};
    const key=createPublicKey(pem);
    if(key.asymmetricKeyType!=='ed25519') return {status:'HOLD',reasons:['UNSUPPORTED_KEY']};
    const message=canonicalDecision({sourceSHA256:dossier.source.sha256,outputSHA256:dossier.conversion.outputSHA256,reviewerId,decision:dossier.review.decision});
    if(!verify(null,message,key,Buffer.from(signature,'base64'))) return {status:'HOLD',reasons:['INVALID_SIGNATURE']};
    return {status:'CRYPTOGRAPHICALLY_VERIFIED',reasons:[]};
  } catch {
    return {status:'HOLD',reasons:['VERIFICATION_ERROR']};
  }
}
// CRYPTOGRAPHICALLY_VERIFIED is NOT source admission or render permission.
