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
