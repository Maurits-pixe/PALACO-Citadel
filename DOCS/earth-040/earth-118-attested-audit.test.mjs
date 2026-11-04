import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {trustSnapshotMessage} from './earth-116-trust-attestation.mjs';
import {verifyAttestedAuditEvidence} from './earth-118-attested-audit.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const snapshot={authenticated:true,epoch:5,expiresAtEpoch:7,checkpoint:{length:1,headHash:'a'.repeat(64)},trustAnchors:new Map(),revokedReviewers:new Set(),revokedKeys:new Set()};
const attestation={protocol:'EARTH-117-v1',signature:sign(null,trustSnapshotMessage(snapshot),privateKey).toString('base64')};
const base={snapshot,attestation,pinnedAuthorityKey:publicKey.export({format:'pem',type:'spki'}),nowEpoch:6,minimumAcceptedEpoch:5,checkpoint:snapshot.checkpoint,signatureProtocol:'EARTH_110_V1'};
assert.equal(verifyAttestedAuditEvidence({...base,attestation:undefined}).reason,'REGISTRY_ATTESTATION_UNTRUSTED');
assert.equal(verifyAttestedAuditEvidence({...base,snapshot:{...snapshot,revokedKeys:new Set(['revoked-a'])}}).reason,'REGISTRY_ATTESTATION_UNTRUSTED');
assert.equal(verifyAttestedAuditEvidence({...base,nowEpoch:8}).reason,'REGISTRY_ATTESTATION_UNTRUSTED');
assert.equal(verifyAttestedAuditEvidence({...base,checkpoint:{...snapshot.checkpoint,headHash:'b'.repeat(64)}}).reason,'CHECKPOINT_MISMATCH');
assert.equal(verifyAttestedAuditEvidence(base).status,'HOLD'); // no audit evidence supplied
console.log('EARTH-118 attested audit entry point PASS');
