import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createRioContactReference } from './reference.mjs';

const SIDES=['SENDER','RECEIVER'];
const TEXT_BODY_LIMIT=4096, OPAQUE_BODY_LIMIT=8192;
const COOKIE={SENDER:'rio_sender',RECEIVER:'rio_receiver'};
function secureEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function cookieValue(header,name) {
  if(typeof header!=='string'||header.length>2048)return null;
  const matches=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  return matches.length===1?matches[0].slice(name.length+1):null;
}
function body(req,limit) {
  return new Promise((resolve,reject)=>{
    let length=0,parts=[],finished=false;
    req.on('data',chunk=>{
      if(finished)return;
      length+=chunk.length;
      if(length>limit){finished=true;parts=[];reject(Object.assign(new Error('TOO_LARGE'),{status:413}));return;}
      parts.push(chunk);
    });
    req.on('end',()=>{
      if(finished)return;finished=true;
      try{resolve(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))));}
      catch{reject(Object.assign(new Error('INVALID_JSON'),{status:400}));}
    });
    req.on('aborted',()=>{if(!finished){finished=true;reject(Object.assign(new Error('ABORTED'),{status:400}));}});
    req.on('error',()=>{if(!finished){finished=true;reject(Object.assign(new Error('BODY_ERROR'),{status:400}));}});
  });
}

/**
 * Caller-owned loopback host capabilities seed the two synthetic browser jars.
 * No bootstrap token appears in an URL, HTTP JSON projection, log or artifact.
 * This server is a local reference harness, never a production login service.
 */
export async function startRioContactPreview({
  databasePath,classification,now,simulateGuards,port=0,host='127.0.0.1',payloadMode='TEXT'
}={}) {
  if(classification!=='SYNTHETIC_ONLY'||host!=='127.0.0.1'||!Number.isInteger(port)||port<0||port>65535) {
    throw new TypeError('EXPLICIT_LOOPBACK_SYNTHETIC_HOST_REQUIRED');
  }
  const controller=createRioContactReference({databasePath,classification,payloadMode,...(now?{now}:{}),...(simulateGuards?{simulateGuards}:{})});
  const maxBody=payloadMode==='OPAQUE_TRANSPORT'?OPAQUE_BODY_LIMIT:TEXT_BODY_LIMIT;
  const credentials=Object.fromEntries(SIDES.map(side=>[side,Object.freeze({
    sessionToken:randomBytes(32).toString('base64url'),csrfToken:randomBytes(32).toString('base64url')
  })]));
  const staticAssets=new Map([
    ['/assets/encrypted-client.mjs',{type:'text/javascript; charset=utf-8',bytes:readFileSync(new URL('../encrypted-reference/client.mjs',import.meta.url))}],
    ['/assets/app.js',{type:'text/javascript; charset=utf-8',bytes:readFileSync(new URL('./app.js',import.meta.url))}],
    ['/assets/style.css',{type:'text/css; charset=utf-8',bytes:readFileSync(new URL('./style.css',import.meta.url))}]
  ]);
  const html=payloadMode==='OPAQUE_TRANSPORT'?Buffer.from('<!doctype html><html lang="nl"><meta charset="utf-8"><title>RIO versleutelde referentieproef</title><body><h1>RIO versleutelde referentieproef</h1><p>Deze pagina dient uitsluitend voor twee geisoleerde browsertests. Geen echte accounts of netwerkberichtendienst.</p></body></html>'):readFileSync(new URL('./index.html',import.meta.url));
  let origin=null,stopping=false;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    function send(status,value,type='application/json; charset=utf-8') {
      if(res.writableEnded)return;
      res.statusCode=status;res.setHeader('Content-Type',type);
      res.end(Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value));
    }
    function error(status) {send(status,{error:'REQUEST_NOT_ACCEPTED',mode:'REFERENCE_ONLY',classification:'SYNTHETIC_ONLY'});}
    function authorized(side) {
      return SIDES.includes(side)&&secureEqual(cookieValue(req.headers.cookie,COOKIE[side]),credentials[side].sessionToken);
    }
    try {
      if(stopping||!origin)return error(503);
      if(req.headers.host!==new URL(origin).host)return error(421);
      if(typeof req.url!=='string'||!req.url.startsWith('/'))return error(400);
      const url=new URL(req.url,origin);
      if(url.origin!==origin||url.search)return error(400);
      if(req.method==='GET'&&staticAssets.has(url.pathname)) {
        const asset=staticAssets.get(url.pathname);return send(200,asset.bytes,asset.type);
      }
      if(req.method==='GET'&&['/sender/','/receiver/'].includes(url.pathname)) {
        const side=url.pathname==='/sender/'?'SENDER':'RECEIVER';
        if(!authorized(side))return error(403);
        res.setHeader('Set-Cookie',COOKIE[side]+'='+credentials[side].sessionToken+'; Path=/; HttpOnly; SameSite=Strict');
        return send(200,html,'text/html; charset=utf-8');
      }
      if(!['/api/state','/api/action'].includes(url.pathname))return error(404);
      const side=req.headers['x-rio-side'];
      if(!authorized(side))return error(403);
      if(url.pathname==='/api/state') {
        if(req.method!=='GET')return error(405);
        const state=controller.view(side);
        if(!state)return error(503);
        return send(200,{...state,csrfToken:credentials[side].csrfToken});
      }
      if(req.method!=='POST')return error(405);
      if(req.headers.origin!==origin||!secureEqual(req.headers['x-rio-csrf'],credentials[side].csrfToken))return error(403);
      if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')return error(403);
      if(typeof req.headers['content-type']!=='string'||req.headers['content-type'].split(';')[0].trim().toLowerCase()!=='application/json')return error(415);
      if(req.headers['content-length']&&(!/^\d+$/.test(req.headers['content-length'])||Number(req.headers['content-length'])>maxBody))return error(413);
      const input=await body(req,maxBody);
      if(stopping)return error(503);
      const outcome=controller.act(side,input);
      return send(outcome.status==='APPLIED'?200:outcome.status==='HOLD'?503:409,outcome);
    } catch(failure) {return error([400,413].includes(failure.status)?failure.status:503);}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=20;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  } catch(error) {controller.close();throw error;}
  origin='http://127.0.0.1:'+server.address().port;
  return Object.freeze({
    origin,senderUrl:origin+'/sender/',receiverUrl:origin+'/receiver/',controller,credentials:Object.freeze(credentials),
    async close(){
      if(stopping)return;stopping=true;controller.close();
      const done=new Promise(resolve=>server.close(resolve));
      server.closeAllConnections();await done;
    }
  });
}
