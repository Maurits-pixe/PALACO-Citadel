import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHouseholdStore} from './src/household-store.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const messages={PROVIDER_CREDIT_EXHAUSTED:'Het OpenAI-project heeft geen API-tegoed. Vul het tegoed aan om met HARAM te praten.',CONSENT_REQUIRED:'Start eerst het gesprek met jouw toestemming.',CONTEXT_CONSENT_REQUIRED:'Geef eerst toestemming om huishoudcontext te gebruiken.',CSRF_INVALID:'Vernieuw de pagina en probeer opnieuw.',ORIGIN_DENIED:'Deze aanvraag hoort niet bij deze lokale werkruimte.',INVALID_INPUT:'Controleer de ingevulde gegevens.',BODY_TOO_LARGE:'Dit bericht is te lang.',PROVIDER_UNAVAILABLE:'De AI-verbinding is niet beschikbaar. Je gegevens zijn niet gewijzigd.',PROVIDER_TIMEOUT:'De AI reageerde niet op tijd. Je kunt opnieuw proberen.',TURN_CANCELLED:'Dit antwoord is gestopt; er is niets toegevoegd.',BUSY:'Wacht tot het lopende gesprek klaar is, of pauzeer het.',STALE_PROPOSAL:'De lijst is veranderd. Vraag een nieuw voorstel.',EXPIRED_PROPOSAL:'Dit voorstel is verlopen. Vraag een nieuw voorstel.',NOT_ALLOWED:'Deze handeling hoort niet bij jouw huidige sessie.',NOT_FOUND:'Dit onderdeel is niet gevonden.',SESSION_REQUIRED:'Open eerst de lokale werkruimte.',RATE_LIMITED:'Even wachten; probeer het zo opnieuw.'};
const statuses={CONSENT_REQUIRED:403,CONTEXT_CONSENT_REQUIRED:403,CSRF_INVALID:403,ORIGIN_DENIED:403,PROVIDER_UNAVAILABLE:502,PROVIDER_TIMEOUT:504,TURN_CANCELLED:409,BUSY:409,STALE_PROPOSAL:409,EXPIRED_PROPOSAL:410,NOT_ALLOWED:403,NOT_FOUND:404,SESSION_REQUIRED:403,RATE_LIMITED:429};
const strict=(value,keys)=>{if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw fail('INVALID_INPUT');return value;};
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(request){
 if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type']||''))throw fail('INVALID_INPUT');
 if(Number(request.headers['content-length'])>8192){request.resume();throw fail('BODY_TOO_LARGE',413);}
 return new Promise((done,reject)=>{let bytes=0,chunks=[],failed=false;request.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){if(!failed)reject(fail('BODY_TOO_LARGE',413));failed=true;chunks=[];}else if(!failed)chunks.push(chunk);});request.on('end',()=>{if(failed)return;try{done(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(fail('INVALID_INPUT'));}});request.on('error',()=>reject(fail('INVALID_INPUT')));request.on('aborted',()=>reject(fail('TURN_CANCELLED',409)));});
}

export async function startRuntimeServer({port=4193,filename,brain,providerConfigured=Boolean(process.env.OPENAI_API_KEY),model=process.env.HARAM_MODEL||'gpt-6-astra',deadlineMs=45000}={}){
 if(!Number.isInteger(port)||port<0||port>65535||!Number.isFinite(deadlineMs)||deadlineMs<=0)throw fail('INVALID_INPUT');
 if(!filename){mkdirSync(resolve(here,'.data'),{recursive:true});filename=resolve(here,'.data/household.sqlite');}
 const store=createHouseholdStore({filename}),sessions=new Map();
 const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.css',['app.css','text/css; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']]].map(([url,[name,type]])=>[url,{bytes:readFileSync(resolve(here,'public',name)),type}]));
 assets.set('/reference.jpg',{bytes:readFileSync(resolve(here,'../ambassades/rio/visitcard/hara/reference.jpg')),type:'image/jpeg'});
 assets.set('/hara-icon.png',{bytes:readFileSync(resolve(here,'../ambassades/rio/visitcard/hara-icon.png')),type:'image/png'});
 let origin,closing=false,verified=false,realBrain=brain;
 const context=session=>({...store.identity,sessionId:session.scopeId});
 const invalidate=session=>{session.epoch++;session.controller?.abort(fail('TURN_CANCELLED',409));store.revokeSession(context(session));session.scopeId=randomUUID();session.conversation=[];};
 const state=session=>({csrfToken:session.csrf,runtime:{name:'HARA',mode:'LOCAL_DEVELOPMENT',state:session.controller&&!session.controller.signal.aborted?'THINKING':session.consent.chat?'READY':'PAUSED',provider:'OpenAI',providerConfigured,providerConnection:verified?'VERIFIED':'UNVERIFIED',model,identityBasis:'LOCAL_OPERATOR',externalActions:false},consent:{...session.consent},household:store.read(context(session)),conversation:structuredClone(session.conversation),proposals:store.pending(context(session)),receipts:store.receipts(context(session))});
 const server=createServer(async(request,response)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
  const send=(status,value,type='application/json; charset=utf-8')=>{if(response.destroyed||response.writableEnded)return;const bytes=Buffer.isBuffer(value)?value:Buffer.from(type.startsWith('application/json')?JSON.stringify(value):String(value));response.writeHead(status,{...headers,'Content-Type':type,'Content-Length':bytes.length});response.end(request.method==='HEAD'?undefined:bytes);};
  try{
   if(closing)throw fail('PROVIDER_UNAVAILABLE',503);
   if(request.headers.host!==new URL(origin).host||request.headers.origin&&request.headers.origin!==origin)throw fail('ORIGIN_DENIED',403);
   const path=request.url;
   if(typeof path!=='string'||!path.startsWith('/')||/[?%\\\x00-\x20]/.test(path))throw fail('INVALID_INPUT');
   if(!['GET','HEAD','POST'].includes(request.method)){headers.Allow='GET, HEAD, POST';return send(405,{error:{code:'METHOD_NOT_ALLOWED',message:'Deze methode is niet beschikbaar.'}});}
   if((request.method==='GET'||request.method==='HEAD')&&assets.has(path)){const a=assets.get(path);return send(200,a.bytes,a.type);}
   if((request.method==='GET'||request.method==='HEAD')&&path==='/health')return send(200,{status:'ok',mode:'LOCAL_DEVELOPMENT',providerConfigured,model});
   if(!path.startsWith('/api/'))throw fail('NOT_FOUND',404);
   if(request.headers['sec-fetch-site']==='cross-site')throw fail('ORIGIN_DENIED',403);
   const cookie=String(request.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hara_session='))?.slice(13);
   let session=sessions.get(cookie);
   if(!session&&request.method==='GET'&&path==='/api/state'){
    if(sessions.size>=64)throw fail('RATE_LIMITED',429);
    const id=randomBytes(32).toString('hex');session={id,scopeId:randomUUID(),csrf:randomBytes(32).toString('hex'),consent:{chat:false,household:false},conversation:[],epoch:0,controller:null,requests:[]};sessions.set(id,session);headers['Set-Cookie']='hara_session='+id+'; HttpOnly; SameSite=Strict; Path=/';
   }
   if(!session)throw fail('SESSION_REQUIRED',403);
   if(request.method==='GET'&&path==='/api/state')return send(200,state(session));
   if(request.method!=='POST')throw fail('NOT_FOUND',404);
   if(request.headers.origin!==origin)throw fail('ORIGIN_DENIED',403);
   if(!safeEqual(request.headers['x-csrf-token'],session.csrf))throw fail('CSRF_INVALID',403);
   const data=await body(request);
   if(path==='/api/consent'){
    strict(data,['chat','household']);if(typeof data.chat!=='boolean'||typeof data.household!=='boolean'||!data.chat&&data.household)throw fail('INVALID_INPUT');
    if(session.consent.chat!==data.chat||session.consent.household!==data.household)invalidate(session);
    session.consent={chat:data.chat,household:data.household};return send(200,{state:state(session)});
   }
   if(path==='/api/reset'){strict(data,[]);invalidate(session);return send(200,{state:state(session)});}
   const proposal=path.match(/^\/api\/proposals\/([A-Za-z0-9_-]{1,100})\/(approve|reject)$/);
   if(proposal){
    if(!session.consent.chat)throw fail('CONSENT_REQUIRED',403);if(!session.consent.household)throw fail('CONTEXT_CONSENT_REQUIRED',403);if(session.controller)throw fail('BUSY',409);
    if(proposal[2]==='approve'){strict(data,['digest']);store.approve(context(session),{proposalId:proposal[1],digest:data.digest});}
    else{strict(data,[]);store.reject(context(session),{proposalId:proposal[1]});}
    return send(200,{state:state(session)});
   }
   if(path!=='/api/chat')throw fail('NOT_FOUND',404);
   strict(data,['message']);if(typeof data.message!=='string'||!data.message.trim()||data.message.length>4000)throw fail('INVALID_INPUT');
   if(!session.consent.chat)throw fail('CONSENT_REQUIRED',403);if(session.controller)throw fail('BUSY',409);if(!providerConfigured)throw fail('PROVIDER_UNAVAILABLE',503);
   session.requests=session.requests.filter(at=>Date.now()-at<60000);if(session.requests.length>=12)throw fail('RATE_LIMITED',429);session.requests.push(Date.now());
   const epoch=session.epoch,scope=context(session),controller=new AbortController(),created=[];session.controller=controller;
   const current=()=>{if(closing||controller.signal.aborted||session.epoch!==epoch||!session.consent.chat)throw fail('TURN_CANCELLED',409);};
   const household=()=>{current();if(!session.consent.household)throw fail('CONTEXT_CONSENT_REQUIRED',403);return store.read(scope);};
   const proposeChange=action=>{household();if(created.length>=8)throw fail('INVALID_INPUT');const value=store.propose(scope,action);created.push(value.id);return value;};
   let timer,onDisconnect;
   try{
    if(!realBrain){const {createHaramBrain}=await import('./src/agent.mjs');realBrain=createHaramBrain({model});}current();
    const stopped=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(controller.signal.reason||fail('TURN_CANCELLED',409)),{once:true});});
    timer=setTimeout(()=>controller.abort(fail('PROVIDER_TIMEOUT',504)),deadlineMs);
    onDisconnect=()=>{if(!response.writableEnded)controller.abort(fail('TURN_CANCELLED',409));};response.once('close',onDisconnect);
    const output=await Promise.race([realBrain.respond({input:data.message.trim(),history:structuredClone(session.conversation.slice(-12)),readHousehold:household,proposeChange,signal:controller.signal}),stopped]);
    current();if(typeof output!=='string'||!output.trim()||output.length>16000)throw fail('PROVIDER_UNAVAILABLE',502);
    const at=new Date().toISOString();session.conversation.push({id:randomUUID(),role:'user',text:data.message.trim(),at},{id:randomUUID(),role:'assistant',text:output.trim(),at});session.conversation=session.conversation.slice(-40);verified=true;
   }catch(error){for(const id of created){try{store.reject(scope,{proposalId:id});}catch{}}throw controller.signal.aborted?(controller.signal.reason||fail('TURN_CANCELLED',409)):error;}
   finally{clearTimeout(timer);if(onDisconnect)response.off('close',onDisconnect);if(session.controller===controller)session.controller=null;}
   return send(200,{state:state(session)});
  }catch(error){if(['credit_balance_exhausted','insufficient_quota'].includes(error?.code))error=fail('PROVIDER_CREDIT_EXHAUSTED',503);const known=messages[error?.code]!==undefined,code=known?error.code:'PROVIDER_UNAVAILABLE',status=known?(error.status||statuses[code]||400):502;send(status,{error:{code,message:messages[code]}});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 server.listen(port,'127.0.0.1');
 try{await once(server,'listening');}catch(error){store.close();throw error;}
 origin='http://127.0.0.1:'+server.address().port;
 return {origin,async close(){closing=true;for(const session of sessions.values())session.controller?.abort(fail('TURN_CANCELLED',409));server.closeAllConnections();await new Promise(done=>server.close(done));store.close();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const port=process.env.PORT?Number(process.env.PORT):4193;const app=await startRuntimeServer({port});console.log('HARA / HARAM: '+app.origin+' — lokale ontwikkelruntime, alleen deze computer.');console.log('Open de werkruimte en kies zelf wanneer je het AI-gesprek start.');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit(0)));}
 catch{console.error('HARA kon niet starten. Controleer Node 24, de dependencies en of de lokale poort vrij is.');process.exitCode=1;}
}
