import assert from 'node:assert/strict';
import {createHaramBrain} from './src/agent.mjs';
import {createHouseholdStore} from './src/household-store.mjs';

// Explicit live check: synthetic in-memory household only, never the real database.
const store=createHouseholdStore({filename:':memory:'});
const scope={...store.identity,sessionId:'synthetic-live-smoke'};
let reads=0,proposals=[];
try{
 const model=process.env.HARAM_MODEL||'gpt-6-astra';
 const output=await createHaramBrain({model}).respond({input:'Dit is een synthetische functietest. Lees het huishouden met read_household. Maak daarna precies één voorstel om Testbrood aan de boodschappenlijst toe te voegen, met lege details en zonder datum. Zeg duidelijk dat het een voorstel is; voer niets zelf uit.',history:[],signal:AbortSignal.timeout(45000),readHousehold:()=>{reads++;return store.read(scope);},proposeChange:action=>{const proposal=store.propose(scope,action);proposals.push(proposal);return proposal;}});
 assert.ok(output.trim());assert.ok(reads>=1);assert.equal(proposals.length,1);assert.equal(proposals[0].action.operation,'add');assert.equal(proposals[0].action.kind,'shopping');assert.match(proposals[0].action.title,/testbrood/i);
 assert.equal(store.read(scope).items.length,0,'Model proposal must not itself change the household');
 const receipt=store.approve(scope,{proposalId:proposals[0].id,digest:proposals[0].digest});
 assert.equal(store.read(scope).items.length,1);assert.deepEqual(store.approve(scope,{proposalId:proposals[0].id,digest:proposals[0].digest}),receipt);assert.equal(store.receipts(scope).length,1);
 console.log(JSON.stringify({status:'PASS',liveProvider:true,model,syntheticOnly:true,readToolCalls:reads,proposals:proposals.length,itemsBeforeApproval:0,itemsAfterApproval:1,idempotentReceipts:1,outputCharacters:output.length,productionMutation:false}));
}catch(error){console.log(JSON.stringify({status:'FAIL',liveProvider:true,syntheticOnly:true,errorType:typeof error?.name==='string'?error.name:'Error',errorCode:typeof error?.code==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(error.code)?error.code:'LIVE_CHECK_FAILED',httpStatus:Number.isInteger(error?.status)?error.status:null}));process.exitCode=1;}
finally{store.close();}
