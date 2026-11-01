import assert from 'node:assert/strict';
import {validateTrustContext} from './earth-114-trust-context.mjs';
const snapshot={authenticated:true,epoch:5,expiresAtEpoch:7,trustAnchors:new Map(),revokedReviewers:new Set(),revokedKeys:new Set(),checkpoint:{length:1,headHash:'a'.repeat(64)}};
const base={snapshot,nowEpoch:6,minimumAcceptedEpoch:5};
assert.equal(validateTrustContext(base).status,'TRUST_CONTEXT_STRUCTURALLY_VALID');
for(const input of [
 {...base,snapshot:{...snapshot,authenticated:false}},
 {...base,snapshot:{...snapshot,epoch:4}},
 {...base,snapshot:{...snapshot,epoch:7}},
 {...base,snapshot:{...snapshot,expiresAtEpoch:5}},
 {...base,snapshot:{...snapshot,revokedKeys:[]}},
 {...base,snapshot:{...snapshot,checkpoint:{length:1,headHash:'bad'}}},
 {...base,minimumAcceptedEpoch:8}
]) assert.equal(validateTrustContext(input).status,'HOLD');
console.log('EARTH-114 trust-context structural gate PASS');
