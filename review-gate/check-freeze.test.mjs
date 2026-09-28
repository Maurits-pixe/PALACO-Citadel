import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import {validateFreeze} from './check-freeze.mjs';
const freeze=JSON.parse(await readFile(new URL('./freeze.json',import.meta.url),'utf8'));
function evidence(){return {prs:freeze.subjects.map(s=>({number:s.pr,head:{sha:s.head},base:{ref:s.base_ref,sha:s.base_sha}})),runs:freeze.subjects.map(s=>({id:s.ci_run,head_sha:s.head,name:'Citadel local preview conformance',status:'completed',conclusion:'success'})),mergeBase:freeze.dependency.merge_base,contractVersion:freeze.contract_version};}
test('frozen heads, bases, contract and successful CI match without granting activation',()=>{
  const result=validateFreeze(freeze,evidence());assert.equal(result.status,'FROZEN_EVIDENCE_MATCHES');assert.equal(result.activation,'NOT_AUTHORIZED');
});
test('any dependency, merge-base or CI drift invalidates frozen evidence',()=>{
  for(const change of [e=>e.prs[0].head.sha='new',e=>e.prs[0].base.sha='new',e=>e.prs[1].head.sha='new',e=>e.prs[1].base.sha='new',e=>e.mergeBase='new',e=>e.runs[1].conclusion='failure',e=>e.runs[1].head_sha='unrelated',e=>e.contractVersion='2']){
    const e=evidence();change(e);assert.equal(validateFreeze(freeze,e).status,'REVIEW_INVALIDATED');
  }
});
