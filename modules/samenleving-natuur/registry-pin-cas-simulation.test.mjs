import test from 'node:test';
import assert from 'node:assert/strict';
import {computeRegistryPinEntryHash} from './registry-pin-ledger.mjs';
import {simulatePinCas,CAS_SCHEMA} from './registry-pin-cas-simulation.mjs';

const pin=(revision,letter)=>({
 schema:'palaco-citadel-registry-snapshot-pin-v1',
 issuerFingerprint:'a'.repeat(64),revision,registrySha256:letter.repeat(64)
});
const genesisPin=pin(1,'b'),active=pin(2,'c'),candidate=pin(3,'d');
const entry={sequence:1,previousHash:'0'.repeat(64),fromPin:genesisPin,toPin:active};
const head=computeRegistryPinEntryHash(entry);
const state=()=>({pin:{...active},headHash:head,
 entries:[{...entry,fromPin:{...genesisPin},toPin:{...active}}]});
const expected=()=>({revision:2,registrySha256:active.registrySha256,headHash:head});
const pending=()=>({
 sequence:2,previousHash:head,fromPin:active,toPin:candidate
});
const review=()=>({
 schema:'palaco-citadel-pin-update-review-v1',reviewSignaturesValid:true,
 proposalConsistent:true,candidateLedgerHash:computeRegistryPinEntryHash(pending()),
 authorization:'DENY',stateChanged:false
});
const run=changes=>simulatePinCas({
 genesisPin,currentState:state(),expectedState:expected(),
 proposedPin:candidate,dualReview:review(),...changes
});

test('CAS simulation creates a separate hypothetical next state, never an authorization',()=>{
 const old=state(),oldCopy=structuredClone(old);
 const r=run({currentState:old});
 assert.equal(r.schema,CAS_SCHEMA);
 assert.equal(r.simulationAccepted,true,JSON.stringify(r));
 assert.equal(r.hypotheticalNextState.pin.revision,3);
 assert.equal(r.hypotheticalNextState.entries.length,2);
 assert.deepEqual(old,oldCopy);
 assert.equal(r.stateChanged,false);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.executionAllowed,false);
 assert.equal(r.releaseAllowed,false);
});
test('two contenders based on same head cannot both succeed after simulated advancement',()=>{
 const a=run();
 assert.equal(a.simulationAccepted,true);
 const b=run({currentState:a.hypotheticalNextState});
 assert.equal(b.simulationAccepted,false);
 assert.equal(b.reason,'CAS_CONFLICT');
});
test('wrong expected revision, hash, and anchor fail closed',()=>{
 for(const expectedState of [
  {...expected(),revision:1},
  {...expected(),registrySha256:'f'.repeat(64)},
  {...expected(),headHash:'e'.repeat(64)}
 ]){
  assert.equal(run({expectedState}).reason,'CAS_CONFLICT');
 }
});
test('corrupted existing chain fails before candidate review',()=>{
 const corrupt=state();
 corrupt.entries[0].toPin.registrySha256='f'.repeat(64);
 assert.equal(run({currentState:corrupt}).reason,'UNVERIFIED_CURRENT_LEDGER');
});
test('rollback and issuer switch rejected even with claimed review',()=>{
 for(const proposedPin of [pin(2,'e'),pin(1,'e'),
  {...candidate,issuerFingerprint:'f'.repeat(64)}]){
  assert.equal(run({proposedPin}).reason,'NON_MONOTONIC_PIN');
 }
});
test('stale or mismatching review cannot pass even as simulation',()=>{
 for(const dualReview of [
  null,{...review(),reviewSignaturesValid:false},
  {...review(),candidateLedgerHash:'f'.repeat(64)},
  {...review(),authorization:'ALLOW'},
  {...review(),stateChanged:true}
 ]){
  assert.equal(run({dualReview}).reason,'REVIEW_PRECHECK_MISMATCH');
 }
});
test('malformed and injected state is denied',()=>{
 for(const currentState of [null,{},[],{...state(),headHash:'bad'}]){
  const result=run({currentState});
  assert.equal(result.simulationAccepted,false);
  assert.equal(result.authorization,'DENY');
 }
});
test('reference output includes no real side effects',()=>{
 const result=run();
 assert.equal(result.trust,'NOT_ESTABLISHED');
 assert.ok(result.unresolvedGates.includes('ATOMIC_DATABASE_TRANSACTION'));
 assert.equal(result.stateChanged,false);
 assert.equal(result.hypotheticalNextState.entries[1].previousHash,head);
});
