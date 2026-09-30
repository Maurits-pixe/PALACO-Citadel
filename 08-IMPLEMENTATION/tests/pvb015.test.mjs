import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalize, projectVisitCard, signingInput, sha256, signWithTestSeed, verifyWithPublicKey, authorize, evaluateKeyTrust, evaluateTemporalValidity, DOMAIN } from "../src/pvb/pvb015.mjs";

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

console.log(JSON.stringify({
  suite:"PVB-015",
  vector:vector.vector_id,
  canonical_bytes:Buffer.byteLength(canonical,"utf8"),
  digest:vector.signing_input_sha256_hex,
  tests:{G0001:"PASS",G0002:"PASS",G0003:"PASS",G0004:"PASS",G0005:"PASS",G0006:"PASS",G0007:"PASS",G0008:"PASS"},
  claim:"EXECUTION EVIDENCE ONLY — NOT PVB-V1 CONFORMANCE"
},null,2));
