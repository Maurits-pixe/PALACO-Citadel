// EARTH-105: actual legacy JavaScript preimages as golden vectors.
// The fixture is generated at test time by Node; no signatures or authority.
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const receipt={protocol:'EARTH-084-v1',sourceSHA256:null,outputSHA256:null,reviewerId:'reviewer-α',trustedEpoch:1,minimumAcceptedEpoch:0,status:'HOLD',stage:'REVIEW',reasons:['niet toegelaten','🌍']};
const receiptSHA256=hash(receipt);
const genesis={index:0,previousHash:null,receiptSHA256,status:receipt.status,stage:receipt.stage};
const first={...genesis,recordHash:hash(genesis)};
const secondBase={index:1,previousHash:first.recordHash,receiptSHA256,status:receipt.status,stage:receipt.stage};
const second={...secondBase,recordHash:hash(secondBase)};
process.stdout.write(JSON.stringify({receipt:{...receipt,receiptSHA256},chain:[first,second]}));
