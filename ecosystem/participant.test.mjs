import test from 'node:test';
import assert from 'node:assert/strict';
import {REPOSITORY,exportDocument,readDocument} from './participant.mjs';
test('participant preserves its source and cannot export another repository identity',async()=>{
 const ref={repository:REPOSITORY,commitSha:'b'.repeat(40),path:'README.md'};
 const doc={documentId:'participant-fixture',title:'Fixture',content:'Synthetic participant fixture.',status:'draft'};
 const data=await readDocument(await exportDocument(doc,ref));
 assert.equal(data.reference.repository,REPOSITORY);assert.deepEqual(data.document,doc);
 assert.equal(data.boundary.sourceVerified,false);
 await assert.rejects(exportDocument(doc,{...ref,repository:'attacker/project'}));
});

import {readForQa,quoteDocument} from './participant.mjs';
test('pinned III6V9 Q&A preserves disclaimer and rejects fabricated quotes',async()=>{
 const bytes=await exportDocument({documentId:'qa-fixture',title:'Title',content:'Grounded synthetic text.',status:'specificatie'},
 {repository:REPOSITORY,commitSha:'b'.repeat(40),path:'README.md'});
 const doc=await readForQa(bytes);assert.equal(doc.source.verified,false);assert.equal(doc.source.statusProvidedBy,'USER');
 const quote=await quoteDocument(bytes,'synthetic text');assert.equal(quote.label,'gebruikersopgave — niet geverifieerd');
 await assert.rejects(quoteDocument(bytes,'invented quote'),/QUOTE_NOT_IN_DOCUMENT/);
 assert.ok(Object.isFrozen(doc.source));
});
