import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const DOMAIN = "PALACO-PVB-V1-VISITCARD";
export const IDENTITY_FIELDS = Object.freeze([
  "protocol_version","visitcard_id","object_type","identity_ref","epoch",
  "provenance_ref","validity","discovery_policy","rio_destination_ref","control_state"
]);

function assertIJson(value) {
  if (typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value))) {
    throw new TypeError("PVB V1 numbers must be finite safe integers");
  }
  if (Array.isArray(value)) value.forEach(assertIJson);
  else if (value && typeof value === "object") Object.values(value).forEach(assertIJson);
  else if (typeof value === "string" && /[\uD800-\uDFFF]/u.test(value)) {
    // JS regex sees surrogate code units; reject only unpaired surrogates below.
    for (let i=0;i<value.length;i++) {
      const c=value.charCodeAt(i);
      if (c>=0xD800&&c<=0xDBFF) { const n=value.charCodeAt(++i); if (!(n>=0xDC00&&n<=0xDFFF)) throw new TypeError("unpaired surrogate"); }
      else if (c>=0xDC00&&c<=0xDFFF) throw new TypeError("unpaired surrogate");
    }
  }
}

export function projectVisitCard(record) {
  const out = {};
  for (const field of IDENTITY_FIELDS) {
    if (!(field in record)) throw new TypeError(`missing identity-bound field: ${field}`);
    out[field] = record[field];
  }
  return out;
}

export function canonicalize(value) {
  assertIJson(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+canonicalize(value[k])).join(",") + "}";
}

export function signingInput(record, domain = DOMAIN) {
  const canonical = Buffer.from(canonicalize(projectVisitCard(record)), "utf8");
  return Buffer.concat([Buffer.from(domain, "ascii"), Buffer.from([0]), canonical]);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest();
}

function privateKeyFromSeed(seed) {
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420","hex"), seed]);
  return createPrivateKey({key:der,format:"der",type:"pkcs8"});
}
function publicKeyFromRaw(raw) {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100","hex"), raw]);
  return createPublicKey({key:der,format:"der",type:"spki"});
}

export function signWithTestSeed(record, seedHex, domain = DOMAIN) {
  return sign(null, signingInput(record, domain), privateKeyFromSeed(Buffer.from(seedHex,"hex")));
}
export function verifyWithPublicKey(record, signature, publicKeyHex, domain = DOMAIN) {
  return verify(null, signingInput(record, domain), publicKeyFromRaw(Buffer.from(publicKeyHex,"hex")), signature);
}
export function authorize({ verifiedVisitCard, mandate }) {
  return Object.freeze({ authorized: Boolean(verifiedVisitCard && mandate), reason: mandate ? "MANDATE_PRESENT" : "MANDATE_REQUIRED" });
}


export function evaluateKeyTrust({ cryptographicallyVerified, keyState }) {
  if (!cryptographicallyVerified) return Object.freeze({ trusted:false, reason:"INVALID_SIGNATURE" });
  if (keyState === "REVOKED") return Object.freeze({ trusted:false, reason:"KEY_REVOKED", historicalAuthenticity:true });
  if (keyState === "EXPIRED") return Object.freeze({ trusted:false, reason:"KEY_EXPIRED", historicalAuthenticity:true });
  if (keyState !== "ACTIVE") return Object.freeze({ trusted:false, reason:"KEY_STATE_UNSUPPORTED" });
  return Object.freeze({ trusted:true, reason:"KEY_ACTIVE", historicalAuthenticity:true });
}

export function evaluateTemporalValidity(validity, nowIso) {
  const now=Date.parse(nowIso), start=Date.parse(validity.not_before), end=Date.parse(validity.not_after);
  if (![now,start,end].every(Number.isFinite)) return Object.freeze({ valid:false, reason:"MALFORMED_TIME" });
  if (now < start) return Object.freeze({ valid:false, reason:"NOT_YET_VALID" });
  if (now >= end) return Object.freeze({ valid:false, reason:"EXPIRED" });
  return Object.freeze({ valid:true, reason:"CURRENT" });
}


export function verifyWatermerkLineage({ identityRef, events }) {
  let highestEpoch = -1;
  let activeKey = null;
  const revoked = new Set();
  for (const event of events) {
    if (event.identity_ref !== identityRef) return Object.freeze({ valid:false, reason:"IDENTITY_SUBSTITUTION" });
    if (!Number.isSafeInteger(event.epoch) || event.epoch <= highestEpoch) return Object.freeze({ valid:false, reason:"NON_MONOTONE_EPOCH" });
    highestEpoch = event.epoch;
    if (event.type === "KEY_ACTIVATED") {
      if (revoked.has(event.key_id)) return Object.freeze({ valid:false, reason:"REVOKED_KEY_REVIVAL" });
      activeKey = event.key_id;
    } else if (event.type === "KEY_REVOKED") {
      revoked.add(event.key_id);
      if (activeKey === event.key_id) activeKey = null;
    } else return Object.freeze({ valid:false, reason:"UNSUPPORTED_LINEAGE_EVENT" });
  }
  return Object.freeze({ valid:true, activeKey, highestEpoch, revokedKeys:Object.freeze([...revoked]) });
}

export function evaluateLineageSignature({ cryptographicallyVerified, signatureKeyId, lineage }) {
  if (!cryptographicallyVerified) return Object.freeze({ trusted:false, historicalAuthenticity:false, reason:"INVALID_SIGNATURE" });
  if (!lineage.valid) return Object.freeze({ trusted:false, historicalAuthenticity:true, reason:lineage.reason });
  if (lineage.revokedKeys.includes(signatureKeyId)) return Object.freeze({ trusted:false, historicalAuthenticity:true, reason:"KEY_REVOKED" });
  if (lineage.activeKey !== signatureKeyId) return Object.freeze({ trusted:false, historicalAuthenticity:true, reason:"KEY_NOT_CURRENT" });
  return Object.freeze({ trusted:true, historicalAuthenticity:true, reason:"CURRENT_LINEAGE_KEY" });
}


export function watermerkEventHash(event) {
  const material={
    epoch:event.epoch,
    identity_ref:event.identity_ref,
    key_id:event.key_id,
    previous_event_hash:event.previous_event_hash,
    type:event.type
  };
  return sha256(Buffer.from(canonicalize(material),"utf8")).toString("hex");
}

export function buildWatermerkChain({ identityRef, events }) {
  let previousEventHash="GENESIS";
  return events.map(event => {
    const linked={...event,identity_ref:identityRef,previous_event_hash:previousEventHash};
    const event_hash=watermerkEventHash(linked);
    previousEventHash=event_hash;
    return Object.freeze({...linked,event_hash});
  });
}

export function verifyWatermerkChain({ identityRef, events }) {
  let expectedPrevious="GENESIS";
  let highestEpoch=-1;
  const seenParents=new Set();
  for (const event of events) {
    if (event.identity_ref !== identityRef) return Object.freeze({valid:false,reason:"IDENTITY_SUBSTITUTION"});
    if (!Number.isSafeInteger(event.epoch) || event.epoch <= highestEpoch) return Object.freeze({valid:false,reason:"NON_MONOTONE_EPOCH"});
    if (event.previous_event_hash !== expectedPrevious) return Object.freeze({valid:false,reason:"BROKEN_PREVIOUS_HASH"});
    if (seenParents.has(event.previous_event_hash)) return Object.freeze({valid:false,reason:"FORK_DETECTED"});
    if (watermerkEventHash(event) !== event.event_hash) return Object.freeze({valid:false,reason:"EVENT_HASH_MISMATCH"});
    seenParents.add(event.previous_event_hash);
    expectedPrevious=event.event_hash;
    highestEpoch=event.epoch;
  }
  return Object.freeze({valid:true,headHash:expectedPrevious,highestEpoch,eventCount:events.length});
}

export function detectWatermerkFork({ identityRef, branches }) {
  const parentToChild=new Map();
  for (const branch of branches) {
    for (const event of branch) {
      if (event.identity_ref !== identityRef) return Object.freeze({valid:false,reason:"IDENTITY_SUBSTITUTION"});
      const existing=parentToChild.get(event.previous_event_hash);
      if (existing && existing !== event.event_hash) return Object.freeze({valid:false,reason:"FORK_DETECTED"});
      parentToChild.set(event.previous_event_hash,event.event_hash);
    }
  }
  return Object.freeze({valid:true,reason:"NO_FORK"});
}


export function advanceEraTrustedTime(state, observation) {
  const observed=Date.parse(observation.trusted_time);
  const highest=state.highestTrustedTime ? Date.parse(state.highestTrustedTime) : -Infinity;
  if (!Number.isFinite(observed)) return Object.freeze({...state,accepted:false,reason:"MALFORMED_TRUSTED_TIME"});
  if (!Number.isSafeInteger(observation.sequence) || observation.sequence <= state.highestSequence) {
    return Object.freeze({...state,accepted:false,reason:"NON_MONOTONE_TIME_SEQUENCE"});
  }
  if (observed < highest) return Object.freeze({...state,accepted:false,reason:"TRUSTED_TIME_ROLLBACK"});
  return Object.freeze({
    highestTrustedTime:observation.trusted_time,
    highestSequence:observation.sequence,
    accepted:true,
    reason:"TRUSTED_TIME_ADVANCED"
  });
}

export function evaluateMonotoneTemporalState({ previousState, candidateState }) {
  const terminal=new Set(["REVOKED","EXPIRED"]);
  if (terminal.has(previousState) && candidateState !== previousState) {
    return Object.freeze({accepted:false,state:previousState,reason:"TERMINAL_STATE_REVIVAL_DENIED"});
  }
  return Object.freeze({accepted:true,state:candidateState,reason:"STATE_ACCEPTED"});
}

export function evaluateWithEraTime({ validity, eraState }) {
  if (!eraState.highestTrustedTime) return Object.freeze({valid:false,reason:"TEMPORAL_UNCERTAIN"});
  return evaluateTemporalValidity(validity,eraState.highestTrustedTime);
}


export function resolveTrustedTimeConsensus({ observations, minimumSources=2, allowedSkewMs=1000 }) {
  if (!Number.isSafeInteger(minimumSources) || minimumSources < 2) return Object.freeze({accepted:false,reason:"INVALID_QUORUM_POLICY"});
  if (!Number.isFinite(allowedSkewMs) || allowedSkewMs < 0) return Object.freeze({accepted:false,reason:"INVALID_SKEW_POLICY"});
  const unique=new Map();
  for (const observation of observations) {
    if (!observation.source_id || unique.has(observation.source_id)) return Object.freeze({accepted:false,reason:"DUPLICATE_TIME_SOURCE"});
    const millis=Date.parse(observation.trusted_time);
    if (!Number.isFinite(millis)) return Object.freeze({accepted:false,reason:"MALFORMED_TRUSTED_TIME"});
    if (observation.authenticated !== true) return Object.freeze({accepted:false,reason:"UNAUTHENTICATED_TIME_SOURCE"});
    unique.set(observation.source_id,{...observation,millis});
  }
  if (unique.size < minimumSources) return Object.freeze({accepted:false,reason:"INSUFFICIENT_TIME_QUORUM"});
  const sorted=[...unique.values()].sort((a,b)=>a.millis-b.millis);
  const windows=[];
  for (let left=0;left<sorted.length;left++) {
    let right=left;
    while (right+1<sorted.length && sorted[right+1].millis-sorted[left].millis<=allowedSkewMs) right++;
    windows.push(sorted.slice(left,right+1));
  }
  const bestSize=Math.max(...windows.map(w=>w.length));
  if (bestSize < minimumSources) return Object.freeze({accepted:false,reason:"TEMPORAL_UNCERTAIN"});
  const bestWindows=windows.filter(w=>w.length===bestSize);
  const signatures=new Set(bestWindows.map(w=>w.map(o=>o.source_id).sort().join("|")));
  if (signatures.size>1) return Object.freeze({accepted:false,reason:"BYZANTINE_TIME_CONFLICT"});
  const best=bestWindows[0];
  if (best[best.length-1].millis-best[0].millis>allowedSkewMs) return Object.freeze({accepted:false,reason:"TEMPORAL_UNCERTAIN"});
  if (best.length*2 <= sorted.length) return Object.freeze({accepted:false,reason:"BYZANTINE_TIME_CONFLICT"});
  const consensusMillis=Math.floor(best.reduce((sum,o)=>sum+o.millis,0)/best.length);
  return Object.freeze({
    accepted:true,
    reason:"TIME_CONSENSUS",
    trusted_time:new Date(consensusMillis).toISOString(),
    source_ids:Object.freeze(best.map(o=>o.source_id).sort()),
    outlier_source_ids:Object.freeze(sorted.filter(o=>!best.includes(o)).map(o=>o.source_id).sort())
  });
}


export const TIME_OBSERVATION_DOMAIN="PALACO-ERA-V1-TIME-OBSERVATION";

export function timeObservationSigningInput(observation, domain=TIME_OBSERVATION_DOMAIN) {
  const payload={
    protocol_version:"ERA/1",
    source_id:observation.source_id,
    sequence:observation.sequence,
    trusted_time:observation.trusted_time
  };
  return Buffer.concat([Buffer.from(domain,"ascii"),Buffer.from([0]),Buffer.from(canonicalize(payload),"utf8")]);
}

export function signTimeObservationWithTestSeed(observation, seedHex, domain=TIME_OBSERVATION_DOMAIN) {
  return sign(null,timeObservationSigningInput(observation,domain),privateKeyFromSeed(Buffer.from(seedHex,"hex")));
}

export function verifySignedTimeObservation({ observation, signature, providerRegistry, replayState, domain=TIME_OBSERVATION_DOMAIN }) {
  const provider=providerRegistry[observation.source_id];
  if (!provider) return Object.freeze({accepted:false,reason:"UNKNOWN_TIME_PROVIDER"});
  if (provider.state !== "ACTIVE") return Object.freeze({accepted:false,reason:"TIME_PROVIDER_NOT_ACTIVE"});
  if (!Number.isSafeInteger(observation.sequence) || observation.sequence <= (replayState[observation.source_id] ?? 0)) {
    return Object.freeze({accepted:false,reason:"TIME_OBSERVATION_REPLAY"});
  }
  const ok=verify(null,timeObservationSigningInput(observation,domain),publicKeyFromRaw(Buffer.from(provider.public_key_hex,"hex")),signature);
  if (!ok) return Object.freeze({accepted:false,reason:"INVALID_TIME_SIGNATURE"});
  return Object.freeze({
    accepted:true,
    reason:"AUTHENTICATED_TIME_OBSERVATION",
    observation:Object.freeze({...observation,authenticated:true}),
    nextReplayState:Object.freeze({...replayState,[observation.source_id]:observation.sequence})
  });
}


export function createTemporalEvidenceReceipt({ receiptSequence, previousReceiptHash="GENESIS", verifiedObservations, consensus, eraState }) {
  if (!Number.isSafeInteger(receiptSequence) || receiptSequence < 1) return Object.freeze({accepted:false,reason:"INVALID_RECEIPT_SEQUENCE"});
  if (!Array.isArray(verifiedObservations) || verifiedObservations.length === 0 || verifiedObservations.some(o=>o.authenticated !== true)) {
    return Object.freeze({accepted:false,reason:"INCOMPLETE_TEMPORAL_EVIDENCE"});
  }
  if (!consensus?.accepted || !eraState?.accepted) return Object.freeze({accepted:false,reason:"UNACCEPTED_TEMPORAL_DECISION"});
  const evidence={
    protocol_version:"ERA-RECEIPT/1",
    receipt_sequence:receiptSequence,
    previous_receipt_hash:previousReceiptHash,
    observations:verifiedObservations.map(o=>({source_id:o.source_id,sequence:o.sequence,trusted_time:o.trusted_time})).sort((a,b)=>a.source_id.localeCompare(b.source_id)),
    consensus:{trusted_time:consensus.trusted_time,source_ids:[...consensus.source_ids],outlier_source_ids:[...consensus.outlier_source_ids]},
    era_state:{highestTrustedTime:eraState.highestTrustedTime,highestSequence:eraState.highestSequence}
  };
  const receipt_hash=sha256(Buffer.from(canonicalize(evidence),"utf8")).toString("hex");
  return Object.freeze({accepted:true,reason:"TEMPORAL_EVIDENCE_RECEIPT",evidence:Object.freeze(evidence),receipt_hash});
}

export function verifyTemporalEvidenceReceipt({ receipt, expectedPreviousReceiptHash, minimumReceiptSequence }) {
  if (!receipt?.accepted || !receipt.evidence || !receipt.receipt_hash) return Object.freeze({valid:false,reason:"MALFORMED_TEMPORAL_RECEIPT"});
  if (receipt.evidence.previous_receipt_hash !== expectedPreviousReceiptHash) return Object.freeze({valid:false,reason:"RECEIPT_CHAIN_MISMATCH"});
  if (!Number.isSafeInteger(receipt.evidence.receipt_sequence) || receipt.evidence.receipt_sequence < minimumReceiptSequence) {
    return Object.freeze({valid:false,reason:"TEMPORAL_RECEIPT_REPLAY"});
  }
  const actual=sha256(Buffer.from(canonicalize(receipt.evidence),"utf8")).toString("hex");
  if (actual !== receipt.receipt_hash) return Object.freeze({valid:false,reason:"TEMPORAL_RECEIPT_HASH_MISMATCH"});
  return Object.freeze({valid:true,reason:"TEMPORAL_RECEIPT_VERIFIED",receipt_hash:receipt.receipt_hash});
}


export const TEMPORAL_RECEIPT_DOMAIN="PALACO-ERA-V1-TEMPORAL-RECEIPT";

export function temporalReceiptSigningInput({ receipt, signer_id, key_id }, domain=TEMPORAL_RECEIPT_DOMAIN) {
  const payload={protocol_version:"ERA-RECEIPT-SIG/1",signer_id,key_id,receipt_hash:receipt.receipt_hash};
  return Buffer.concat([Buffer.from(domain,"ascii"),Buffer.from([0]),Buffer.from(canonicalize(payload),"utf8")]);
}

export function signTemporalReceiptWithTestSeed({ receipt, signer_id, key_id, seedHex, domain=TEMPORAL_RECEIPT_DOMAIN }) {
  return sign(null,temporalReceiptSigningInput({receipt,signer_id,key_id},domain),privateKeyFromSeed(Buffer.from(seedHex,"hex")));
}

export function verifySignedTemporalReceipt({ receipt, signer_id, key_id, signature, signerRegistry, domain=TEMPORAL_RECEIPT_DOMAIN }) {
  const signer=signerRegistry[signer_id];
  if (!signer) return Object.freeze({trusted:false,reason:"UNKNOWN_RECEIPT_SIGNER"});
  if (signer.key_id !== key_id) return Object.freeze({trusted:false,reason:"RECEIPT_KEY_BINDING_MISMATCH"});
  if (signer.state !== "ACTIVE") return Object.freeze({trusted:false,reason:"RECEIPT_SIGNER_NOT_ACTIVE"});
  const actualHash=sha256(Buffer.from(canonicalize(receipt.evidence),"utf8")).toString("hex");
  if (actualHash !== receipt.receipt_hash) return Object.freeze({trusted:false,reason:"TEMPORAL_RECEIPT_HASH_MISMATCH"});
  const ok=verify(null,temporalReceiptSigningInput({receipt,signer_id,key_id},domain),publicKeyFromRaw(Buffer.from(signer.public_key_hex,"hex")),signature);
  if (!ok) return Object.freeze({trusted:false,reason:"INVALID_TEMPORAL_RECEIPT_SIGNATURE"});
  return Object.freeze({trusted:true,reason:"SIGNED_TEMPORAL_RECEIPT_VERIFIED",signer_id,key_id,receipt_hash:receipt.receipt_hash});
}


export function appendTemporalLedger(state, { receipt, signedEvidence }) {
  if (!signedEvidence?.trusted || signedEvidence.receipt_hash !== receipt.receipt_hash) {
    return Object.freeze({...state,accepted:false,reason:"UNTRUSTED_LEDGER_RECEIPT"});
  }
  const sequence=receipt.evidence.receipt_sequence;
  if (!Number.isSafeInteger(sequence) || sequence !== state.highestReceiptSequence + 1) {
    return Object.freeze({...state,accepted:false,reason:"NON_CONTIGUOUS_LEDGER_SEQUENCE"});
  }
  if (receipt.evidence.previous_receipt_hash !== state.headReceiptHash) {
    return Object.freeze({...state,accepted:false,reason:"LEDGER_HEAD_MISMATCH"});
  }
  const trustedTime=Date.parse(receipt.evidence.era_state.highestTrustedTime);
  const highestTime=state.highestTrustedTime ? Date.parse(state.highestTrustedTime) : -Infinity;
  if (!Number.isFinite(trustedTime) || trustedTime < highestTime) {
    return Object.freeze({...state,accepted:false,reason:"LEDGER_TIME_ROLLBACK"});
  }
  return Object.freeze({
    highestReceiptSequence:sequence,
    headReceiptHash:receipt.receipt_hash,
    highestTrustedTime:receipt.evidence.era_state.highestTrustedTime,
    accepted:true,
    reason:"TEMPORAL_LEDGER_APPENDED"
  });
}

export function recoverTemporalLedger({ durableState, snapshotState }) {
  if (!durableState || !snapshotState) return Object.freeze({recovered:false,reason:"RECOVERY_STATE_MISSING"});
  if (snapshotState.highestReceiptSequence > durableState.highestReceiptSequence) {
    return Object.freeze({recovered:false,reason:"SNAPSHOT_AHEAD_OF_DURABLE_LEDGER"});
  }
  if (snapshotState.highestReceiptSequence === durableState.highestReceiptSequence &&
      snapshotState.headReceiptHash !== durableState.headReceiptHash) {
    return Object.freeze({recovered:false,reason:"RECOVERY_HEAD_CONFLICT"});
  }
  const snapshotTime=snapshotState.highestTrustedTime ? Date.parse(snapshotState.highestTrustedTime) : -Infinity;
  const durableTime=durableState.highestTrustedTime ? Date.parse(durableState.highestTrustedTime) : -Infinity;
  if (snapshotTime > durableTime) return Object.freeze({recovered:false,reason:"SNAPSHOT_TIME_AHEAD_OF_DURABLE_LEDGER"});
  return Object.freeze({
    recovered:true,
    reason:snapshotState.highestReceiptSequence < durableState.highestReceiptSequence ? "STALE_SNAPSHOT_OVERRIDDEN" : "DURABLE_STATE_CONFIRMED",
    state:Object.freeze({
      highestReceiptSequence:durableState.highestReceiptSequence,
      headReceiptHash:durableState.headReceiptHash,
      highestTrustedTime:durableState.highestTrustedTime
    })
  });
}
