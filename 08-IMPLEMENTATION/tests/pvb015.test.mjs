import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalize, projectVisitCard, signingInput, sha256, signWithTestSeed, verifyWithPublicKey, authorize, evaluateKeyTrust, evaluateTemporalValidity, verifyWatermerkLineage, evaluateLineageSignature, buildWatermerkChain, verifyWatermerkChain, detectWatermerkFork, advanceEraTrustedTime, evaluateMonotoneTemporalState, evaluateWithEraTime, resolveTrustedTimeConsensus, signTimeObservationWithTestSeed, verifySignedTimeObservation, TIME_OBSERVATION_DOMAIN, createTemporalEvidenceReceipt, verifyTemporalEvidenceReceipt, signTemporalReceiptWithTestSeed, verifySignedTemporalReceipt, TEMPORAL_RECEIPT_DOMAIN, DOMAIN } from "../src/pvb/pvb015.mjs";


function watermerkEventHashForTest(event) {
  const material={epoch:event.epoch,identity_ref:event.identity_ref,key_id:event.key_id,previous_event_hash:event.previous_event_hash,type:event.type};
  return sha256(Buffer.from(canonicalize(material),"utf8")).toString("hex");
}

const vector=JSON.parse(fs.readFileSync(new URL("../vectors/pvb-v1/golden-0001.json", import.meta.url)));
const canonical=canonicalize(projectVisitCard(vector.record));
assert.equal(canonical, vector.canonical_utf8, "G-0001 canonical bytes");
assert.equal(Buffer.byteLength(canonical,"utf8"), vector.canonical_byte_length, "G-0001 byte length");
assert.equal(sha256(signingInput(vector.record)).toString("hex"), vector.signing_input_sha256_hex, "G-0001 digest");
const signature=signWithTestSeed(vector.record, vector.private_seed_hex);
assert.equal(signature.toString("hex"), vector.signature_hex, "G-0001 deterministic Ed25519 signature");
assert.equal(verifyWithPublicKey(vector.record, signature, vector.public_key_hex), true, "G-0001 positive verify");

const epochMutation={...vector.record,epoch:2};
assert.equal(verifyWithPublicKey(epochMutation, signature, vector.public_key_hex), false, "G-0002 identity mutation rejected");

const presentationMutation={...vector.record,display_name:"PALACO VisitCard Black Edition",language:"nl-NL"};
assert.equal(canonicalize(projectVisitCard(presentationMutation)), canonical, "G-0003 presentation excluded");
assert.equal(verifyWithPublicKey(presentationMutation, signature, vector.public_key_hex), true, "G-0003 presentation mutation preserves binding");

assert.equal(verifyWithPublicKey(vector.record, signature, vector.public_key_hex, "PALACO-PVB-V1-BEACON"), false, "G-0004 cross-domain rejected");

const wrongPublicKey="ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf";
assert.equal(verifyWithPublicKey(vector.record, signature, wrongPublicKey), false, "G-0005 wrong key rejected");

const verifiedVisitCard=verifyWithPublicKey(vector.record, signature, vector.public_key_hex, DOMAIN);
assert.deepEqual(evaluateKeyTrust({cryptographicallyVerified:verifiedVisitCard,keyState:"REVOKED"}), {trusted:false,reason:"KEY_REVOKED",historicalAuthenticity:true}, "G-0006 revoked key preserves historical authenticity but loses current trust");
assert.deepEqual(evaluateTemporalValidity(vector.record.validity,"2027-01-01T00:00:00Z"), {valid:false,reason:"EXPIRED"}, "G-0007 expiry boundary is fail-closed");
assert.deepEqual(evaluateTemporalValidity(vector.record.validity,"2026-06-01T00:00:00Z"), {valid:true,reason:"CURRENT"}, "G-0007 current interval remains valid");

assert.deepEqual(authorize({verifiedVisitCard,mandate:null}), {authorized:false,reason:"MANDATE_REQUIRED"}, "G-0008 crypto does not authorize");

const lineage=verifyWatermerkLineage({
  identityRef:vector.record.identity_ref,
  events:[
    {type:"KEY_ACTIVATED",identity_ref:vector.record.identity_ref,key_id:"KEY-001",epoch:1},
    {type:"KEY_ACTIVATED",identity_ref:vector.record.identity_ref,key_id:"KEY-002",epoch:2},
    {type:"KEY_REVOKED",identity_ref:vector.record.identity_ref,key_id:"KEY-001",epoch:3}
  ]
});
assert.deepEqual(lineage, {valid:true,activeKey:"KEY-002",highestEpoch:3,revokedKeys:["KEY-001"]}, "G-0010 WATERMERK lineage reconstructs current key");
assert.deepEqual(evaluateLineageSignature({cryptographicallyVerified:true,signatureKeyId:"KEY-001",lineage}), {trusted:false,historicalAuthenticity:true,reason:"KEY_REVOKED"}, "G-0011 historical KEY-001 remains authentic but untrusted");
assert.deepEqual(evaluateLineageSignature({cryptographicallyVerified:true,signatureKeyId:"KEY-002",lineage}), {trusted:true,historicalAuthenticity:true,reason:"CURRENT_LINEAGE_KEY"}, "G-0012 KEY-002 is current trust");

const revival=verifyWatermerkLineage({
  identityRef:vector.record.identity_ref,
  events:[
    {type:"KEY_ACTIVATED",identity_ref:vector.record.identity_ref,key_id:"KEY-001",epoch:1},
    {type:"KEY_REVOKED",identity_ref:vector.record.identity_ref,key_id:"KEY-001",epoch:2},
    {type:"KEY_ACTIVATED",identity_ref:vector.record.identity_ref,key_id:"KEY-001",epoch:3}
  ]
});
assert.deepEqual(revival, {valid:false,reason:"REVOKED_KEY_REVIVAL"}, "G-0013 revoked key cannot revive");

const rollback=verifyWatermerkLineage({
  identityRef:vector.record.identity_ref,
  events:[
    {type:"KEY_ACTIVATED",identity_ref:vector.record.identity_ref,key_id:"KEY-001",epoch:5},
    {type:"KEY_ACTIVATED",identity_ref:vector.record.identity_ref,key_id:"KEY-002",epoch:4}
  ]
});
assert.deepEqual(rollback, {valid:false,reason:"NON_MONOTONE_EPOCH"}, "G-0014 epoch rollback denied");

const substitution=verifyWatermerkLineage({
  identityRef:vector.record.identity_ref,
  events:[
    {type:"KEY_ACTIVATED",identity_ref:"PALACO:IDENTITY:ATTACKER",key_id:"KEY-X",epoch:1}
  ]
});
assert.deepEqual(substitution, {valid:false,reason:"IDENTITY_SUBSTITUTION"}, "G-0015 identity substitution denied");

const chain=buildWatermerkChain({
  identityRef:vector.record.identity_ref,
  events:[
    {type:"KEY_ACTIVATED",key_id:"KEY-001",epoch:1},
    {type:"KEY_ACTIVATED",key_id:"KEY-002",epoch:2},
    {type:"KEY_REVOKED",key_id:"KEY-001",epoch:3}
  ]
});
const chainEvidence=verifyWatermerkChain({identityRef:vector.record.identity_ref,events:chain});
assert.equal(chainEvidence.valid,true,"G-0020 append-only WATERMERK chain verifies");
assert.equal(chainEvidence.eventCount,3,"G-0020 all provenance events retained");

const deleted=[chain[0],chain[2]];
assert.deepEqual(verifyWatermerkChain({identityRef:vector.record.identity_ref,events:deleted}), {valid:false,reason:"BROKEN_PREVIOUS_HASH"}, "G-0021 event deletion detected");

const reordered=[chain[1],chain[0],chain[2]];
assert.deepEqual(verifyWatermerkChain({identityRef:vector.record.identity_ref,events:reordered}), {valid:false,reason:"BROKEN_PREVIOUS_HASH"}, "G-0022 event reorder detected");

const tampered=chain.map((event,i)=>i===1?{...event,key_id:"KEY-ATTACKER"}:event);
assert.deepEqual(verifyWatermerkChain({identityRef:vector.record.identity_ref,events:tampered}), {valid:false,reason:"EVENT_HASH_MISMATCH"}, "G-0023 event mutation detected");

const forkA=buildWatermerkChain({identityRef:vector.record.identity_ref,events:[{type:"KEY_ACTIVATED",key_id:"KEY-001",epoch:1},{type:"KEY_ACTIVATED",key_id:"KEY-002",epoch:2}]});
const forkB=[forkA[0],...buildWatermerkChain({identityRef:vector.record.identity_ref,events:[{type:"KEY_ACTIVATED",key_id:"KEY-X",epoch:2}]}).slice(1)];
const forkChild={...forkA[1],key_id:"KEY-X"};
forkChild.event_hash=watermerkEventHashForTest(forkChild);
assert.deepEqual(detectWatermerkFork({identityRef:vector.record.identity_ref,branches:[forkA,[forkA[0],forkChild]]}), {valid:false,reason:"FORK_DETECTED"}, "G-0024 competing child for same parent detected");

const substitutedChain=chain.map((event,i)=>i===0?{...event,identity_ref:"PALACO:IDENTITY:ATTACKER"}:event);
assert.deepEqual(verifyWatermerkChain({identityRef:vector.record.identity_ref,events:substitutedChain}), {valid:false,reason:"IDENTITY_SUBSTITUTION"}, "G-0025 provenance identity substitution denied");

let era={highestTrustedTime:null,highestSequence:0};
era=advanceEraTrustedTime(era,{trusted_time:"2026-06-01T00:00:00Z",sequence:1});
assert.equal(era.accepted,true,"G-0030 trusted time observation accepted");
assert.equal(era.highestTrustedTime,"2026-06-01T00:00:00Z","G-0030 highest trusted time retained");

const staleSequence=advanceEraTrustedTime(era,{trusted_time:"2026-07-01T00:00:00Z",sequence:1});
assert.equal(staleSequence.accepted,false,"G-0031 stale time sequence denied");
assert.equal(staleSequence.reason,"NON_MONOTONE_TIME_SEQUENCE","G-0031 explicit sequence failure");

const timeRollback=advanceEraTrustedTime(era,{trusted_time:"2026-05-01T00:00:00Z",sequence:2});
assert.equal(timeRollback.accepted,false,"G-0032 trusted-time rollback denied");
assert.equal(timeRollback.highestTrustedTime,"2026-06-01T00:00:00Z","G-0032 highest trusted time cannot decrease");

const expiredEra=advanceEraTrustedTime(era,{trusted_time:"2027-01-01T00:00:00Z",sequence:2});
assert.equal(expiredEra.accepted,true,"G-0033 trusted time advances to expiry boundary");
assert.deepEqual(evaluateWithEraTime({validity:vector.record.validity,eraState:expiredEra}),{valid:false,reason:"EXPIRED"},"G-0033 ERA time drives fail-closed expiry");

assert.deepEqual(evaluateMonotoneTemporalState({previousState:"REVOKED",candidateState:"ACTIVE"}),{accepted:false,state:"REVOKED",reason:"TERMINAL_STATE_REVIVAL_DENIED"},"G-0034 revoked state cannot revive");
assert.deepEqual(evaluateMonotoneTemporalState({previousState:"EXPIRED",candidateState:"ACTIVE"}),{accepted:false,state:"EXPIRED",reason:"TERMINAL_STATE_REVIVAL_DENIED"},"G-0035 expired state cannot revive");
assert.deepEqual(evaluateWithEraTime({validity:vector.record.validity,eraState:{highestTrustedTime:null,highestSequence:0}}),{valid:false,reason:"TEMPORAL_UNCERTAIN"},"G-0036 missing trusted time fails closed");

const consensus=resolveTrustedTimeConsensus({observations:[
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00.000Z",authenticated:true},
  {source_id:"TIME-B",trusted_time:"2026-06-01T00:00:00.400Z",authenticated:true},
  {source_id:"TIME-C",trusted_time:"2026-06-01T00:10:00.000Z",authenticated:true}
],minimumSources:2,allowedSkewMs:1000});
assert.equal(consensus.accepted,true,"G-0040 quorum consensus accepted");
assert.deepEqual(consensus.source_ids,["TIME-A","TIME-B"],"G-0040 agreeing sources selected");
assert.deepEqual(consensus.outlier_source_ids,["TIME-C"],"G-0041 Byzantine/outlier source isolated");

assert.deepEqual(resolveTrustedTimeConsensus({observations:[
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00Z",authenticated:true},
  {source_id:"TIME-B",trusted_time:"2026-06-01T00:10:00Z",authenticated:true}
],minimumSources:2,allowedSkewMs:1000}),{accepted:false,reason:"TEMPORAL_UNCERTAIN"},"G-0042 no quorum window fails closed");

assert.deepEqual(resolveTrustedTimeConsensus({observations:[
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00Z",authenticated:true},
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00Z",authenticated:true}
],minimumSources:2,allowedSkewMs:1000}),{accepted:false,reason:"DUPLICATE_TIME_SOURCE"},"G-0043 duplicate identity cannot manufacture quorum");

assert.deepEqual(resolveTrustedTimeConsensus({observations:[
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00Z",authenticated:true},
  {source_id:"TIME-B",trusted_time:"2026-06-01T00:00:00Z",authenticated:false}
],minimumSources:2,allowedSkewMs:1000}),{accepted:false,reason:"UNAUTHENTICATED_TIME_SOURCE"},"G-0044 unauthenticated source denied");

assert.deepEqual(resolveTrustedTimeConsensus({observations:[
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00Z",authenticated:true},
  {source_id:"TIME-B",trusted_time:"2026-06-01T00:00:00Z",authenticated:true},
  {source_id:"TIME-C",trusted_time:"2026-06-01T00:10:00Z",authenticated:true},
  {source_id:"TIME-D",trusted_time:"2026-06-01T00:10:00Z",authenticated:true}
],minimumSources:2,allowedSkewMs:1000}),{accepted:false,reason:"BYZANTINE_TIME_CONFLICT"},"G-0045 split quorum is conflict, never silent tie-break");

assert.deepEqual(resolveTrustedTimeConsensus({observations:[
  {source_id:"TIME-A",trusted_time:"2026-06-01T00:00:00Z",authenticated:true}
],minimumSources:2,allowedSkewMs:1000}),{accepted:false,reason:"INSUFFICIENT_TIME_QUORUM"},"G-0046 single source cannot become authority");

const timeProviderSeed=vector.private_seed_hex;
const providerRegistry={"TIME-A":{public_key_hex:vector.public_key_hex,state:"ACTIVE"}};
const timeObs={source_id:"TIME-A",sequence:1,trusted_time:"2026-06-01T00:00:00.000Z"};
const timeSig=signTimeObservationWithTestSeed(timeObs,timeProviderSeed);
const verifiedTime=verifySignedTimeObservation({observation:timeObs,signature:timeSig,providerRegistry,replayState:{}});
assert.equal(verifiedTime.accepted,true,"G-0050 signed provider observation verifies");
assert.equal(verifiedTime.observation.authenticated,true,"G-0050 cryptographic verification creates authenticated observation");

assert.deepEqual(verifySignedTimeObservation({observation:timeObs,signature:timeSig,providerRegistry,replayState:{"TIME-A":1}}),{accepted:false,reason:"TIME_OBSERVATION_REPLAY"},"G-0051 replayed provider sequence denied");

const wrongTimeSig=signTimeObservationWithTestSeed(timeObs,"4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb");
assert.deepEqual(verifySignedTimeObservation({observation:timeObs,signature:wrongTimeSig,providerRegistry,replayState:{}}),{accepted:false,reason:"INVALID_TIME_SIGNATURE"},"G-0052 wrong provider key denied");

const crossDomainSig=signTimeObservationWithTestSeed(timeObs,timeProviderSeed,"PALACO-PVB-V1-VISITCARD");
assert.deepEqual(verifySignedTimeObservation({observation:timeObs,signature:crossDomainSig,providerRegistry,replayState:{}}),{accepted:false,reason:"INVALID_TIME_SIGNATURE"},"G-0053 cross-domain time signature denied");

const substitutedObs={...timeObs,source_id:"TIME-B"};
assert.deepEqual(verifySignedTimeObservation({observation:substitutedObs,signature:timeSig,providerRegistry,replayState:{}}),{accepted:false,reason:"UNKNOWN_TIME_PROVIDER"},"G-0054 provider substitution denied");

const revokedRegistry={"TIME-A":{public_key_hex:vector.public_key_hex,state:"REVOKED"}};
assert.deepEqual(verifySignedTimeObservation({observation:timeObs,signature:timeSig,providerRegistry:revokedRegistry,replayState:{}}),{accepted:false,reason:"TIME_PROVIDER_NOT_ACTIVE"},"G-0055 revoked provider denied");

const authenticatedConsensus=resolveTrustedTimeConsensus({observations:[
  verifiedTime.observation,
  {source_id:"TIME-B",trusted_time:"2026-06-01T00:00:00.300Z",authenticated:true},
  {source_id:"TIME-C",trusted_time:"2026-06-01T00:10:00.000Z",authenticated:true}
],minimumSources:2,allowedSkewMs:1000});
assert.equal(authenticatedConsensus.accepted,true,"G-0056 verified observation is consumable by PVB-019 consensus");

const receiptObservations=[
  verifiedTime.observation,
  {source_id:"TIME-B",sequence:1,trusted_time:"2026-06-01T00:00:00.300Z",authenticated:true},
  {source_id:"TIME-C",sequence:1,trusted_time:"2026-06-01T00:10:00.000Z",authenticated:true}
];
const receiptConsensus=resolveTrustedTimeConsensus({observations:receiptObservations,minimumSources:2,allowedSkewMs:1000});
const receiptEra=advanceEraTrustedTime({highestTrustedTime:null,highestSequence:0},{trusted_time:receiptConsensus.trusted_time,sequence:1});
const temporalReceipt=createTemporalEvidenceReceipt({receiptSequence:1,verifiedObservations:receiptObservations,consensus:receiptConsensus,eraState:receiptEra});
assert.equal(temporalReceipt.accepted,true,"G-0060 end-to-end temporal receipt created");
assert.equal(verifyTemporalEvidenceReceipt({receipt:temporalReceipt,expectedPreviousReceiptHash:"GENESIS",minimumReceiptSequence:1}).valid,true,"G-0060 receipt reproduces and verifies");

const mutatedReceipt={...temporalReceipt,evidence:{...temporalReceipt.evidence,era_state:{...temporalReceipt.evidence.era_state,highestTrustedTime:"2026-01-01T00:00:00.000Z"}}};
assert.deepEqual(verifyTemporalEvidenceReceipt({receipt:mutatedReceipt,expectedPreviousReceiptHash:"GENESIS",minimumReceiptSequence:1}),{valid:false,reason:"TEMPORAL_RECEIPT_HASH_MISMATCH"},"G-0061 receipt mutation detected");

assert.deepEqual(createTemporalEvidenceReceipt({receiptSequence:2,verifiedObservations:[{...verifiedTime.observation,authenticated:false}],consensus:receiptConsensus,eraState:receiptEra}),{accepted:false,reason:"INCOMPLETE_TEMPORAL_EVIDENCE"},"G-0062 missing authenticated evidence denied");

assert.deepEqual(verifyTemporalEvidenceReceipt({receipt:temporalReceipt,expectedPreviousReceiptHash:"GENESIS",minimumReceiptSequence:2}),{valid:false,reason:"TEMPORAL_RECEIPT_REPLAY"},"G-0063 old receipt sequence replay denied");

assert.deepEqual(verifyTemporalEvidenceReceipt({receipt:temporalReceipt,expectedPreviousReceiptHash:"different-head",minimumReceiptSequence:1}),{valid:false,reason:"RECEIPT_CHAIN_MISMATCH"},"G-0064 receipt chain rollback/fork denied");

const secondReceipt=createTemporalEvidenceReceipt({receiptSequence:2,previousReceiptHash:temporalReceipt.receipt_hash,verifiedObservations:receiptObservations,consensus:receiptConsensus,eraState:receiptEra});
assert.equal(verifyTemporalEvidenceReceipt({receipt:secondReceipt,expectedPreviousReceiptHash:temporalReceipt.receipt_hash,minimumReceiptSequence:2}).valid,true,"G-0065 chained temporal receipt verifies");

const receiptSignerRegistry={"ERA-SIGNER-001":{key_id:"ERA-KEY-001",public_key_hex:vector.public_key_hex,state:"ACTIVE"}};
const receiptSignature=signTemporalReceiptWithTestSeed({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",seedHex:vector.private_seed_hex});
const signedReceiptEvidence=verifySignedTemporalReceipt({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",signature:receiptSignature,signerRegistry:receiptSignerRegistry});
assert.equal(signedReceiptEvidence.trusted,true,"G-0070 temporal receipt signature verifies");

const wrongReceiptSignature=signTemporalReceiptWithTestSeed({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",seedHex:"4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb"});
assert.deepEqual(verifySignedTemporalReceipt({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",signature:wrongReceiptSignature,signerRegistry:receiptSignerRegistry}),{trusted:false,reason:"INVALID_TEMPORAL_RECEIPT_SIGNATURE"},"G-0071 wrong receipt signing key denied");

const crossReceiptSignature=signTemporalReceiptWithTestSeed({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",seedHex:vector.private_seed_hex,domain:TIME_OBSERVATION_DOMAIN});
assert.deepEqual(verifySignedTemporalReceipt({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",signature:crossReceiptSignature,signerRegistry:receiptSignerRegistry}),{trusted:false,reason:"INVALID_TEMPORAL_RECEIPT_SIGNATURE"},"G-0072 cross-domain receipt signature denied");

const tamperedSignedReceipt={...temporalReceipt,evidence:{...temporalReceipt.evidence,receipt_sequence:99}};
assert.deepEqual(verifySignedTemporalReceipt({receipt:tamperedSignedReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",signature:receiptSignature,signerRegistry:receiptSignerRegistry}),{trusted:false,reason:"TEMPORAL_RECEIPT_HASH_MISMATCH"},"G-0073 mutated signed receipt denied");

const revokedReceiptSigner={"ERA-SIGNER-001":{key_id:"ERA-KEY-001",public_key_hex:vector.public_key_hex,state:"REVOKED"}};
assert.deepEqual(verifySignedTemporalReceipt({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-001",signature:receiptSignature,signerRegistry:revokedReceiptSigner}),{trusted:false,reason:"RECEIPT_SIGNER_NOT_ACTIVE"},"G-0074 revoked receipt signer denied");

assert.deepEqual(verifySignedTemporalReceipt({receipt:temporalReceipt,signer_id:"ERA-SIGNER-001",key_id:"ERA-KEY-ATTACKER",signature:receiptSignature,signerRegistry:receiptSignerRegistry}),{trusted:false,reason:"RECEIPT_KEY_BINDING_MISMATCH"},"G-0075 signer/key substitution denied");


console.log(JSON.stringify({
  suite:"PVB-015+PVB-016+PVB-017+PVB-018+PVB-019+PVB-020+PVB-021+PVB-022",
  vector:vector.vector_id,
  canonical_bytes:Buffer.byteLength(canonical,"utf8"),
  digest:vector.signing_input_sha256_hex,
  tests:{G0001:"PASS",G0002:"PASS",G0003:"PASS",G0004:"PASS",G0005:"PASS",G0006:"PASS",G0007:"PASS",G0008:"PASS",G0010:"PASS",G0011:"PASS",G0012:"PASS",G0013:"PASS",G0014:"PASS",G0015:"PASS",G0020:"PASS",G0021:"PASS",G0022:"PASS",G0023:"PASS",G0024:"PASS",G0025:"PASS",G0030:"PASS",G0031:"PASS",G0032:"PASS",G0033:"PASS",G0034:"PASS",G0035:"PASS",G0036:"PASS",G0040:"PASS",G0041:"PASS",G0042:"PASS",G0043:"PASS",G0044:"PASS",G0045:"PASS",G0046:"PASS",G0050:"PASS",G0051:"PASS",G0052:"PASS",G0053:"PASS",G0054:"PASS",G0055:"PASS",G0056:"PASS",G0060:"PASS",G0061:"PASS",G0062:"PASS",G0063:"PASS",G0064:"PASS",G0065:"PASS",G0070:"PASS",G0071:"PASS",G0072:"PASS",G0073:"PASS",G0074:"PASS",G0075:"PASS"},
  claim:"EXECUTION EVIDENCE ONLY — NOT PVB-V1 CONFORMANCE"
},null,2));
