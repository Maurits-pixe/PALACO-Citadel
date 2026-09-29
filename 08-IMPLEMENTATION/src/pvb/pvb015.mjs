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
