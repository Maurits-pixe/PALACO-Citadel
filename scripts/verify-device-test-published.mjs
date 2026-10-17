import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const ORIGIN='https://palaco-ambassades.onrender.com';
const API='/api/rio/device-test';
const SCOPE='RIO_DEVICE_CHALLENGE_V1';
const SCENARIO='MOBILE_CROSS_PROVIDER';
const DECLARATION={wifiOff:true,mobileDataOn:true,differentProviders:true,noHotspot:true};
const guests=[];
const steps=[];
let current='start';
const key=()=>randomBytes(16).toString('hex');
const check=condition=>{if(!condition)throw new Error('Device test check failed');};
const step=name=>{current=name;};
const passed=()=>{steps.push(current);console.log('RIO_DEVICE_HTTPS '+current+' PASS');};
async function call(path,{guest,body,origin=ORIGIN,csrf=true}={}) {
  const response=await fetch(ORIGIN+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'Cache-Control':'no-cache',...(guest?{Cookie:guest.cookie}:{}),...(body!==undefined?{Origin:origin,'Content-Type':'application/json',
      ...(guest&&csrf?{'X-Device-Test-CSRF':guest.csrf}:{})}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const bytes=Buffer.from(await response.arrayBuffer());
  check(bytes.length<1024*1024);
  let data=null;try{data=JSON.parse(bytes.toString('utf8'));}catch{}
  return {status:response.status,headers:response.headers,bytes,data};
}
async function bootstrap() {
  const result=await call(API+'/session',{body:{}});
  check(result.status===200);
  const raw=result.headers.get('set-cookie');
  check(typeof raw==='string' && raw.startsWith('__Host-palacoDeviceTest=') && /; Secure(?:;|$)/.test(raw)
    && raw.includes('; HttpOnly') && raw.includes('; SameSite=Strict') && raw.includes('; Path=/') && !raw.includes('Domain='));
  const value=raw.split(';')[0].split('=')[1];
  check(/^[a-f0-9]{64}$/.test(value) && /^[a-f0-9]{64}$/.test(result.data?.session?.csrfToken));
  check(!result.bytes.toString('utf8').includes(value));
  const guest={cookie:raw.split(';')[0],csrf:result.data.session.csrfToken};guests.push(guest);return guest;
}
async function own(guest) {
  const result=await call(API+'/pair',{guest});check(result.status===200);return result.data.pair;
}
async function action(guest,name,extra={},requestKey=key()) {
  const pair=await own(guest);
  const body={action:name,pairId:pair.id,revision:pair.revision,idempotencyKey:requestKey,...extra};
  const result=await call(API+'/pair/actions',{guest,body});
  return {result,body};
}
try {
  step('exact-public-assets');
  for(const [route,file] of [['/rio/device-test/','index.html'],['/rio/device-test/index.html','index.html'],['/rio/device-test/app.js','app.js']]) {
    const expected=await readFile(new URL('../ambassades/rio/device-test/'+file,import.meta.url));
    const actual=await call(route);check(actual.status===200 && expected.equals(actual.bytes));
    check(actual.headers.get('cache-control')==='no-store');
    console.log('RIO_DEVICE_ASSET '+route+' '+createHash('sha256').update(actual.bytes).digest('hex'));
  }
  passed();
  step('tested-build-and-closed-gates');
  const runtime=await call(API+'/runtime');
  check(runtime.status===200 && runtime.data.mode==='TEST_ONLY' && runtime.data.generatedCodesOnly===true
    && runtime.data.authenticatedIdentity===false && runtime.data.accountActive===false
    && runtime.data.account1==='HOLD' && runtime.data.canOpenContact===false && runtime.data.operativeAuthority==='NONE'
    && runtime.data.endToEndEncrypted===false && runtime.data.serverReadable===true);
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  check(/^[a-f0-9]{40}$/.test(head) && runtime.data.buildCommit===head);
  const auth=await call('/api/auth/status');check(auth.status===200 && auth.data.available===false && auth.data.authenticated===false
    && auth.data.securityApproval.outcome==='HOLD');
  for(const path of ['/login','/signup','/callback','/api/me'])check((await call(path)).status===503);
  const nova=await call('/api/rio/nova/runtime');check(nova.status===200 && nova.data.chatEnabled===false);
  check((await call('/auth/device-test.mjs')).status===404);
  passed();
  step('independent-secure-guest-sessions');
  const a=await bootstrap(),b=await bootstrap(),c=await bootstrap();
  check(a.cookie!==b.cookie && b.cookie!==c.cookie && a.cookie!==c.cookie);passed();
  step('single-use-invitation-and-outside-session');
  const createKey=key();
  const created=await call(API+'/pair',{guest:a,body:{idempotencyKey:createKey,scenario:SCENARIO}});
  check(created.status===201 && /^[a-f0-9]{64}$/.test(created.data.inviteToken));
  const invite=created.data.inviteToken,pairId=created.data.pair.id;
  const replay=await call(API+'/pair',{guest:a,body:{idempotencyKey:createKey,scenario:SCENARIO}});
  check(replay.status===200 && replay.data.replayed===true && !Object.hasOwn(replay.data,'inviteToken'));
  check((await call(API+'/pair',{guest:c})).status===404);
  const joined=await call(API+'/join',{guest:b,body:{inviteToken:invite,idempotencyKey:key()}});
  check(joined.status===200 && joined.data.pair.id===pairId && joined.data.pair.role==='B');
  check((await call(API+'/join',{guest:c,body:{inviteToken:invite,idempotencyKey:key()}})).status===404);
  passed();
  step('bilateral-test-consent-required');
  check((await action(a,'challenge')).result.status===409);
  check((await action(a,'accept',{scope:SCOPE})).result.status===400);
  check((await action(a,'accept',{scope:SCOPE,networkDeclaration:DECLARATION})).result.status===200);
  check((await action(a,'challenge')).result.status===409);
  check((await action(b,'accept',{scope:SCOPE,networkDeclaration:DECLARATION})).result.status===200);
  const declared=await own(a);
  check(declared.state==='ACTIVE_TEST' && declared.scenario===SCENARIO && declared.consent.A===true && declared.consent.B===true);
  check(declared.evidence.network.A===true && declared.evidence.network.B===true
    && declared.evidence.network.source==='PARTICIPANT_DECLARATION' && declared.evidence.network.providersVerified===false
    && declared.evidence.physicalDevicesVerified===false && declared.evidence.delivery.status==='PENDING');passed();
  step('actual-code-transfer-with-safe-retry');
  const sent=await action(a,'challenge');check(sent.result.status===200);
  const duplicate=await call(API+'/pair/actions',{guest:a,body:sent.body});
  check(duplicate.status===200 && duplicate.data.replayed===true && duplicate.data.pair.messages.length===1);
  const received=(await own(b)).messages[0];
  check(received.kind==='CHALLENGE' && received.from==='A' && /^[a-f0-9]{32}$/.test(received.code) && received.acknowledged===false);
  check((await action(a,'ack',{messageId:received.id})).result.status===404);
  check((await action(b,'reply',{messageId:received.id})).result.status===409);passed();
  step('recipient-ack-and-matching-return-code');
  check((await action(b,'ack',{messageId:received.id})).result.status===200);
  check((await action(b,'reply',{messageId:received.id})).result.status===200);
  const returned=(await own(a)).messages[1];
  check(returned.kind==='REPLY' && returned.from==='B' && returned.replyTo===received.id && returned.code===received.code);
  check((await action(a,'ack',{messageId:returned.id})).result.status===200);
  const completed=await own(b);
  check(completed.messages.length===2 && completed.messages.every(message=>message.acknowledged));
  check(completed.evidence.delivery.completedRoundTrips===1 && completed.evidence.delivery.status==='ACKNOWLEDGED'
    && completed.evidence.network.providersVerified===false && completed.evidence.physicalDevicesVerified===false);passed();
  step('csrf-denial-and-close-revocation');
  const currentPair=await own(a);
  check((await call(API+'/pair/actions',{guest:a,origin:'https://invalid.example',body:{
    action:'challenge',pairId,revision:currentPair.revision,idempotencyKey:key()}})).status===403);
  check((await call(API+'/pair/actions',{guest:a,csrf:false,body:{
    action:'challenge',pairId,revision:currentPair.revision,idempotencyKey:key()}})).status===403);
  const closed=await action(a,'close',{revision:1});
  check(closed.result.status===200 && closed.result.data.pair.state==='CLOSED' && closed.result.data.pair.messages.length===0);
  const receipt=closed.result.data.receipt;
  check(JSON.stringify(Object.keys(receipt).sort())===JSON.stringify(['version','mode','buildCommit','pairId','scenario','closedAt','evidence','accounts','endToEndEncrypted'].sort()));
  check(receipt.version==='RIO_DEVICE_RECEIPT_V1' && receipt.mode==='TEST_ONLY' && receipt.buildCommit===head
    && receipt.pairId===pairId && receipt.scenario===SCENARIO && receipt.accounts==='CLOSED' && receipt.endToEndEncrypted===false
    && receipt.evidence.delivery.completedRoundTrips===1 && receipt.evidence.delivery.status==='ACKNOWLEDGED'
    && receipt.evidence.network.A===true && receipt.evidence.network.B===true
    && receipt.evidence.network.providersVerified===false && receipt.evidence.physicalDevicesVerified===false);
  const safe=JSON.stringify(receipt);
  for(const secret of [invite,a.csrf,b.csrf,received.code])check(!safe.includes(secret));
  const closeReplay=await call(API+'/pair/actions',{guest:a,body:closed.body});
  check(closeReplay.status===200 && closeReplay.data.replayed===true && JSON.stringify(closeReplay.data.receipt)===safe);
  check((await call(API+'/pair',{guest:a})).status===404 && (await call(API+'/pair',{guest:b})).status===404);
  check((await call(API+'/join',{guest:c,body:{inviteToken:invite,idempotencyKey:key()}})).status===404);passed();
  console.log('RIO_DEVICE_HTTPS_SUMMARY '+JSON.stringify({status:'PASS',steps:steps.length,buildCommit:head,
    generatedCodesOnly:true,scenario:SCENARIO,physicalPhonesVerified:false,mobileProvidersVerified:false,accounts:'CLOSED',novaContact:'HOLD',endToEndEncrypted:false}));
} catch {
  console.error('RIO_DEVICE_HTTPS_FAILED '+current);process.exitCode=1;
} finally {
  for(const guest of guests) {
    try {
      const result=await call(API+'/session/end',{guest,body:{}});
      if(result.status!==200 && result.status!==401)throw new Error();
    } catch {console.error('RIO_DEVICE_HTTPS_CLEANUP_FAILED');process.exitCode=1;}
  }
}
