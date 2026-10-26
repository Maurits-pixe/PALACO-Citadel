import test from 'node:test';
import assert from 'node:assert/strict';
import {Usage} from '@openai/agents';
import {createHaramBrain} from '../src/agent.mjs';
const message=text=>({type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]});
const call=(name,args)=>({type:'function_call',name,callId:'call-'+name,arguments:JSON.stringify(args)});
function harness(outputs){const requests=[];const model={async getResponse(request){requests.push(request);const next=outputs.shift();if(typeof next==='function')return next(request);assert.ok(next,'Unexpected extra model request');return {usage:new Usage({requests:1,inputTokens:1,outputTokens:1,totalTokens:2}),output:next};},async *getStreamedResponse(){throw Error('Unexpected streaming');}};return {requests,brain:createHaramBrain({modelProvider:{async getModel(){return model;}}})};}
const action={operation:'add',kind:'shopping',title:'Testbrood',details:'',dueDate:null};
test('real SDK loop reads and proposes through host callbacks, without any household execution tool',async()=>{
 const h=harness([[call('read_household',{})],[call('propose_household_change',{action})],[message('Het voorstel staat klaar voor jouw bevestiging.')]]);let reads=0,proposed=[];
 const output=await h.brain.respond({input:'Stel brood voor.',history:[{role:'user',text:'Een eerdere vraag'},{role:'assistant',text:'Een eerder antwoord'}],readHousehold:()=>{reads++;return {items:[],revision:0};},proposeChange:value=>{proposed.push(value);return {id:'proposal-1',status:'PENDING',action:value};},signal:new AbortController().signal});
 assert.equal(reads,1);assert.deepEqual(proposed,[action]);assert.match(output,/voorstel/);assert.equal(h.requests.length,3);assert.equal(h.requests[0].modelSettings.store,false);assert.equal(h.requests[0].tracing,false);assert.deepEqual(h.requests[0].tools.map(t=>t.name).sort(),['propose_household_change','read_household']);assert.ok(JSON.stringify(h.requests[0].input).includes('Een eerder antwoord'));assert.equal(JSON.stringify(h.requests).includes('OPENAI_API_KEY'),false);
});
test('denied context becomes a safe tool result and never creates a proposal',async()=>{
 const h=harness([[call('read_household',{})],[message('Geef eerst contexttoestemming.')]]);let proposed=0;
 const output=await h.brain.respond({input:'Wat staat er op mijn lijst?',readHousehold:()=>{throw Object.assign(new Error('safe'),{code:'CONTEXT_CONSENT_REQUIRED'});},proposeChange:()=>proposed++,signal:new AbortController().signal});
 assert.equal(proposed,0);assert.match(output,/toestemming/);assert.ok(JSON.stringify(h.requests[1].input).includes('CONTEXT_CONSENT_REQUIRED'));
});
test('invalid model action cannot reach host proposal callback',async()=>{
 const h=harness([[call('propose_household_change',{action:{...action,actorId:'forged'}})],[message('Geen wijziging uitgevoerd.')]]);let proposed=0;
 try{await h.brain.respond({input:'Doe iets.',readHousehold:()=>({items:[]}),proposeChange:()=>proposed++,signal:new AbortController().signal});}catch(error){assert.ok(error instanceof Error);}
 assert.equal(proposed,0);
});
test('unknown execution tool cannot bypass the fixed tool set',async()=>{
 const h=harness([[call('AUTHORIZE',{actorId:'forged'})]]);let proposed=0;
 await assert.rejects(h.brain.respond({input:'Maak mij bevoegd.',readHousehold:()=>({items:[]}),proposeChange:()=>proposed++,signal:new AbortController().signal}));assert.equal(proposed,0);
});
test('abort signal reaches the SDK model and prevents a late final answer',async()=>{
 const controller=new AbortController();let started;const ready=new Promise(r=>started=r);
 const h=harness([request=>new Promise((_,reject)=>{assert.equal(request.signal,controller.signal);started();request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true});})]);
 const response=h.brain.respond({input:'Trage vraag',readHousehold:()=>({items:[]}),proposeChange:()=>assert.fail(),signal:controller.signal});await ready;controller.abort(new Error('cancelled by host'));await assert.rejects(response,/cancelled by host/);
});
test('missing server-side credentials fail before starting a model request',()=>{
 assert.throws(()=>createHaramBrain({apiKey:''}),error=>error.code==='PROVIDER_UNAVAILABLE');
});
