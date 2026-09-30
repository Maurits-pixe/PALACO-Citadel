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
