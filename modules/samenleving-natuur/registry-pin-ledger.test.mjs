import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRegistryPinLedger,computeRegistryPinEntryHash,LEDGER_SCHEMA} from './registry-pin-ledger.mjs';
import {PIN_SCHEMA} from './registry-snapshot-pin.mjs';

const issuerFingerprint='a'.repeat(64);
const pin=(revision,digest)=>({schema:PIN_SCHEMA,issuerFingerprint,revision,registrySha256:digest.repeat(64)});
const genesis=()=>pin(1,'b');
const next=()=>pin(2,'c');
const newer=()=>pin(3,'d');
const link=(sequence,previousHash,fromPin,toPin)=>({sequence,previousHash,fromPin,toPin});
const chain=()=>{
 const first=link(1,'0'.repeat(64),genesis(),next());
 const second=link(2,computeRegistryPinEntryHash(first),next(),newer());
 return [first,second];
};
const inspect=(entries=chain(),overrides={})=>inspectRegistryPinLedger({
 genesisPin:genesis(),entries,expectedHeadHash:entries.length?
 computeRegistryPinEntryHash(entries.at(-1)):'0'.repeat(64),
 expectedCurrentPin:entries.length?entries.at(-1).toPin:genesis(),
 ...overrides
});
test('valid hash-linked revision chain remains non-authorizing',()=>{
 const r=inspect();
 assert.equal(r.schema,LEDGER_SCHEMA);
 assert.equal(r.chainConsistent,true,JSON.stringify(r));
 assert.equal(r.entriesChecked,2);
 assert.equal(r.currentRevision,3);
 assert.equal(r.authorization,'DENY');
 assert.equal(r.stateChanged,false);
 assert.equal(r.releaseAllowed,false);
});
test('genesis-only chain is valid if externally pinned to empty head',()=>{
 const r=inspect([], {expectedCurrentPin:genesis()});
 assert.equal(r.chainConsistent,true);
 assert.equal(r.currentRevision,1);
});
test('tampered record detected against externally pinned head',()=>{
 const entries=chain();
 const anchor=computeRegistryPinEntryHash(entries[1]);
 entries[1]={...entries[1],toPin:{...entries[1].toPin,registrySha256:'e'.repeat(64)}};
 assert.equal(inspect(entries,{expectedHeadHash:anchor}).reason,'HEAD_ANCHOR_MISMATCH');
});
test('missing link and reversed order fail',()=>{
 const entries=chain();
 assert.equal(inspect([entries[1]]).reason,'INVALID_CHAIN_LINK');
 assert.equal(inspect([entries[1],entries[0]]).reason,'INVALID_CHAIN_LINK');
});
test('rollback and equal revision fail even if hash is internally consistent',()=>{
 for(const toPin of [genesis(),{...genesis(),registrySha256:'c'.repeat(64)}]){
  const first=link(1,'0'.repeat(64),genesis(),toPin);
  assert.equal(inspect([first]).reason,'PIN_ROLLBACK_OR_CONFLICT');
 }
});
test('issuer switch and conflicting source pin fail',()=>{
 const switched={...next(),issuerFingerprint:'f'.repeat(64)};
 assert.equal(inspect([link(1,'0'.repeat(64),genesis(),switched)]).reason,'PIN_ROLLBACK_OR_CONFLICT');
 const wrongFrom={...genesis(),registrySha256:'e'.repeat(64)};
 assert.equal(inspect([link(1,'0'.repeat(64),wrongFrom,next())]).reason,'PIN_ROLLBACK_OR_CONFLICT');
});
test('mismatched trusted head and current pin rejected',()=>{
 assert.equal(inspect(chain(),{expectedHeadHash:'f'.repeat(64)}).reason,'HEAD_ANCHOR_MISMATCH');
 assert.equal(inspect(chain(),{expectedCurrentPin:next()}).reason,'CURRENT_PIN_MISMATCH');
});
test('malformed and untrusted records fail closed',()=>{
 for(const entries of [null,{},[{}],[null]]){
  const r=inspectRegistryPinLedger({genesisPin:genesis(),entries,expectedHeadHash:'0'.repeat(64),expectedCurrentPin:genesis()});
  assert.equal(r.chainConsistent,false);
  assert.equal(r.authorization,'DENY');
 }
});
