import express from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const PREFIX = '/api/rio/device-test';
const TOKEN = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{32}$/;
const SCOPE = 'RIO_DEVICE_CHALLENGE_V1';
const DEFAULT_SCENARIO = 'GENERAL_INTERNET';
const MOBILE_SCENARIO = 'MOBILE_CROSS_PROVIDER';
const NETWORK_FIELDS = ['wifiOff', 'mobileDataOn', 'differentProviders', 'noHotspot'];
const isId = value => typeof value === 'string' && ID.test(value);
const isToken = value => typeof value === 'string' && TOKEN.test(value);
const mounted = new WeakSet();
const digest = value => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('hex');
const identifier = () => randomBytes(16).toString('hex');
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const failure = (status, code) => Object.assign(new Error(code), { deviceStatus: status, deviceCode: code });

/** Temporary guest-to-guest diagnostic codes only. This cannot approve identity, account or NOVA access. */
export function mountDeviceTest(app, options = {}) {
  if (!app?.use || mounted.has(app)) throw new TypeError('Invalid device-test mount.');
  const { baseURL = 'https://palaco-ambassades.onrender.com', development = false,
    now = Date.now, sessionTtlMs = 900000, pairTtlMs = 300000,
    maxSessions = 128, maxPairs = 64, maxMessages = 20,
    actionLimit = 90, creationLimit = 30, buildCommit = null } = options;
  const base = new URL(baseURL);
  if (baseURL !== base.origin || base.username || base.password || base.pathname !== '/'
      || typeof development !== 'boolean'
      || (base.protocol !== 'https:' && !(development && base.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
      || typeof now !== 'function'
      || (buildCommit !== null && (typeof buildCommit !== 'string' || !/^[a-f0-9]{40}$/.test(buildCommit)))) throw new TypeError('Invalid device-test configuration.');
  for (const [value, maximum] of [[sessionTtlMs,900000],[pairTtlMs,300000],[maxSessions,128],
    [maxPairs,64],[maxMessages,20],[actionLimit,90],[creationLimit,30]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError('Invalid device-test limit.');
  }
  const anchor = now(), monotonic = performance.now();
  let last = anchor, stopped = false;
  const sessions = new Map(), pairs = new Map(), invites = new Map(), creations = [], globalReads = [], globalWrites = [];
  const cookieName = base.protocol === 'https:' ? '__Host-palacoDeviceTest' : 'palacoDeviceTest';
  const attributes = '; Path=/; HttpOnly; SameSite=Strict' + (base.protocol === 'https:' ? '; Secure' : '');
  function clock() {
    const value = now === Date.now ? anchor + Math.floor(performance.now() - monotonic) : now();
    if (stopped || !Number.isFinite(value) || Math.abs(value) > 8640000000000000) throw failure(503,'DEVICE_CLOCK_UNAVAILABLE');
    last = Math.max(last, value); return last;
  }
  clock();
  function closePair(pair) {
    if (pair.inviteHash) invites.delete(pair.inviteHash);
    pair.inviteHash = null;
    for (const message of pair.messages) message.code = '';
    pair.messages.length = 0;
    pair.commands.clear();
    pair.state = 'CLOSED'; pair.revision += 1;
  }
  function removePair(pair) {
    closePair(pair); pairs.delete(pair.id);
    for (const key of [pair.a, pair.b]) {
      const session = sessions.get(key);
      if (session?.pairId === pair.id) { session.pairId = null; session.keys.clear(); }
    }
  }
  function cleanup(time) {
    for (const pair of pairs.values()) if (time >= pair.expiresAt) removePair(pair);
    for (const [key, session] of sessions) if (time >= session.expiresAt) {
      if (session.pairId && pairs.has(session.pairId)) removePair(pairs.get(session.pairId));
      session.csrf = ''; session.keys.clear(); sessions.delete(key);
    }
    for (const session of sessions.values()) if (session.lastClose && time >= session.lastClose.expiresAt) session.lastClose = null;
    for (const list of [creations, globalReads, globalWrites]) while (list.length && list[0] <= time - 60000) list.shift();
  }
  function readCookie(req) {
    const raw = req.headers.cookie;
    if (raw === undefined) return null;
    if (typeof raw !== 'string' || raw.length > 8192) throw failure(400,'DEVICE_INVALID_COOKIE');
    const values = raw.split(';').map(part=>part.trim()).filter(part=>part.split('=')[0].trim() === cookieName);
    if (!values.length) return null;
    if (values.length !== 1 || !values[0].startsWith(cookieName+'=')) throw failure(400,'DEVICE_INVALID_COOKIE');
    const value = values[0].slice(cookieName.length+1);
    if (!TOKEN.test(value)) throw failure(400,'DEVICE_INVALID_COOKIE');
    return digest(value);
  }
  function readSession(req) {
    const key = readCookie(req), session = key ? sessions.get(key) : null;
    if (!session) throw failure(401,'DEVICE_SESSION_REQUIRED');
    return { key, session };
  }
  function pairFor(key, session) {
    const pair = pairs.get(session.pairId);
    if (!pair || (pair.a !== key && pair.b !== key)) throw failure(404,'DEVICE_PAIR_NOT_FOUND');
    return pair;
  }
  function rate(session, time) {
    while (session.actions.length && session.actions[0] <= time-60000) session.actions.shift();
    if (session.actions.length >= actionLimit) throw failure(429,'DEVICE_RATE_LIMITED');
    session.actions.push(time);
  }
  function csrf(req, session) {
    const value = req.get('X-Device-Test-CSRF');
    if (typeof value !== 'string' || !TOKEN.test(value)
        || !timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(session.csrf,'hex'))) throw failure(403,'DEVICE_CSRF_REQUIRED');
  }
  function evidence(pair) {
    const completedRoundTrips = pair.messages.filter(message => message.kind === 'CHALLENGE' && message.acknowledged
      && pair.messages.some(reply => reply.kind === 'REPLY' && reply.from !== message.from
        && reply.replyTo === message.id && reply.code === message.code && reply.acknowledged)).length;
    return { delivery:{ completedRoundTrips, status:completedRoundTrips > 0 ? 'ACKNOWLEDGED' : 'PENDING' },
      network:{ source:'PARTICIPANT_DECLARATION', A:pair.networkDeclared.A, B:pair.networkDeclared.B, providersVerified:false },
      physicalDevicesVerified:false };
  }
  function view(pair, key) {
    return { id:pair.id, role:pair.a===key?'A':'B', state:pair.state, revision:pair.revision,
      scenario:pair.scenario, evidence:evidence(pair),
      expiresAt:new Date(pair.expiresAt).toISOString(), scope:SCOPE,
      consent:{ A:pair.accepted.A, B:pair.accepted.B },
      messages:pair.messages.map(message=>({ ...message })) };
  }
  function response(pair, key, time, extra={}) {
    return { pair:view(pair,key), serverTime:new Date(time).toISOString(), ...extra };
  }
  function globalRate(list, maximum, time) {
    if (list.length >= maximum) throw failure(429,'DEVICE_GLOBAL_RATE_LIMITED');
    list.push(time);
  }
  function runtime() {
    return { component:'RIO_DEVICE_TEST', version:'0.1', mode:'TEST_ONLY', running:!stopped,
      buildCommit, serverTime:new Date(clock()).toISOString(), accountAccess:'CLOSED', auth:'HOLD', serverReadable:true, storage:'volatile-memory', pairTtlSeconds:pairTtlMs/1000, maxMessages,
      generatedCodesOnly:true, authenticatedIdentity:false, accountActive:false,
      account1:'HOLD', canOpenContact:false, operativeAuthority:'NONE', endToEndEncrypted:false };
  }
  function replay(session, key, fingerprint) {
    const prior = session.keys.get(key);
    if (!prior) return false;
    if (prior !== fingerprint) throw failure(409,'DEVICE_IDEMPOTENCY_CONFLICT');
    return true;
  }
  function remember(session, key, fingerprint) {
    if (session.keys.size >= 64) throw failure(429,'DEVICE_COMMAND_LIMIT');
    session.keys.set(key,fingerprint);
  }
  function privateRead(req,res,next) {
    const origin=req.get('Origin'), site=req.get('Sec-Fetch-Site');
    if ((origin !== undefined && origin !== baseURL) || (site !== undefined && !['same-origin','none'].includes(site))) return next(failure(403,'DEVICE_INVALID_ORIGIN'));
    next();
  }
  function write(req,res,next) {
    const site=req.get('Sec-Fetch-Site');
    if (req.get('Origin') !== baseURL || (site !== undefined && !['same-origin','none'].includes(site))) return next(failure(403,'DEVICE_INVALID_ORIGIN'));
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.get('Content-Type')||'')) return next(failure(415,'DEVICE_JSON_REQUIRED'));
    next();
  }
  const router=express.Router({caseSensitive:true,strict:true});
  const parse=[write,express.json({limit:'1kb',strict:true,inflate:false,type:()=>true}),
    (req,res,next)=>{try{res.locals.deviceTime=clock();cleanup(res.locals.deviceTime);next();}catch(e){next(e);}}];
  router.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','Vary':'Origin, Cookie'});
    try {
      if (req.headers.host !== base.host || req.rawHeaders.filter((value,index)=>index%2===0 && value.toLowerCase()==='host').length!==1 || req.originalUrl.includes('?') || !req.originalUrl.startsWith(PREFIX+'/')) throw failure(400,'DEVICE_INVALID_PATH');
      res.locals.deviceTime=clock();cleanup(res.locals.deviceTime);
      if (req.method === 'GET') globalRate(globalReads,4096,res.locals.deviceTime);
      next();
    } catch(e) { next(e); }
  });
  router.get('/runtime',(req,res)=>res.json(runtime()));
  router.post('/session',...parse,(req,res)=>{
    if (!exact(req.body,[])) throw failure(400,'DEVICE_INVALID_BODY');
    const time=res.locals.deviceTime; globalRate(globalWrites,512,time); let key=readCookie(req), session=sessions.get(key), token=null;
    if (!session) {
      if (sessions.size>=maxSessions || creations.length>=creationLimit) throw failure(503,'DEVICE_CAPACITY_REACHED');
      token=opaque(); key=digest(token);
      session={csrf:opaque(),expiresAt:time+sessionTtlMs,pairId:null,keys:new Map(),actions:[],lastClose:null};
      sessions.set(key,session);creations.push(time);
      res.set('Set-Cookie',cookieName+'='+token+'; Max-Age='+Math.ceil(sessionTtlMs/1000)+attributes);
    } else rate(session,time);
    res.json({session:{csrfToken:session.csrf,expiresAt:new Date(session.expiresAt).toISOString()},runtime:runtime()});
  });
  router.get('/pair',privateRead,(req,res)=>{
    const {key,session}=readSession(req);
    res.json(response(pairFor(key,session),key,res.locals.deviceTime));
  });
  router.post('/pair',...parse,(req,res)=>{
    const hasScenario = Object.hasOwn(req.body || {}, 'scenario');
    if (!exact(req.body, hasScenario ? ['idempotencyKey', 'scenario'] : ['idempotencyKey']) || !isId(req.body.idempotencyKey)
        || (hasScenario && ![DEFAULT_SCENARIO, MOBILE_SCENARIO].includes(req.body.scenario))) throw failure(400,'DEVICE_INVALID_BODY');
    const scenario = hasScenario ? req.body.scenario : DEFAULT_SCENARIO;
    const {key,session}=readSession(req);csrf(req,session);globalRate(globalWrites,512,res.locals.deviceTime);rate(session,res.locals.deviceTime);
    const fingerprint='create:'+scenario;
    if (replay(session,req.body.idempotencyKey,fingerprint)) return res.json(response(pairFor(key,session),key,res.locals.deviceTime,{replayed:true}));
    const prior=pairs.get(session.pairId);
    if (prior && prior.state!=='CLOSED') throw failure(409,'DEVICE_ALREADY_PAIRED');
    if (prior) removePair(prior);
    if (pairs.size>=maxPairs) throw failure(503,'DEVICE_CAPACITY_REACHED');
    const invite=opaque(), pair={id:identifier(),a:key,b:null,state:'WAITING_PEER',accepted:{A:false,B:false},
      scenario,networkDeclared:{A:false,B:false},
      revision:1,expiresAt:Math.min(res.locals.deviceTime+pairTtlMs,session.expiresAt),
      inviteHash:digest(invite),messages:[],commands:new Map()};
    remember(session,req.body.idempotencyKey,fingerprint);
    pairs.set(pair.id,pair);invites.set(pair.inviteHash,pair.id);session.pairId=pair.id;
    res.status(201).json(response(pair,key,res.locals.deviceTime,{inviteToken:invite,replayed:false}));
  });
  router.post('/join',...parse,(req,res)=>{
    if (!exact(req.body,['inviteToken','idempotencyKey']) || !isToken(req.body.inviteToken) || !isId(req.body.idempotencyKey)) throw failure(400,'DEVICE_INVALID_BODY');
    const {key,session}=readSession(req);csrf(req,session);globalRate(globalWrites,512,res.locals.deviceTime);rate(session,res.locals.deviceTime);
    const fingerprint='join:'+digest(req.body.inviteToken);
    if (replay(session,req.body.idempotencyKey,fingerprint)) return res.json(response(pairFor(key,session),key,res.locals.deviceTime,{replayed:true}));
    const prior=pairs.get(session.pairId);
    if (prior && prior.state!=='CLOSED') throw failure(409,'DEVICE_ALREADY_PAIRED');
    if (prior) removePair(prior);
    const pair=pairs.get(invites.get(digest(req.body.inviteToken)));
    if (!pair || pair.state!=='WAITING_PEER' || pair.a===key || pair.b) throw failure(404,'DEVICE_INVITE_UNAVAILABLE');
    remember(session,req.body.idempotencyKey,fingerprint);
    invites.delete(pair.inviteHash);pair.inviteHash=null;pair.b=key;
    pair.state='WAITING_ACCEPT';pair.revision+=1;pair.expiresAt=Math.min(pair.expiresAt,session.expiresAt);
    session.pairId=pair.id;res.json(response(pair,key,res.locals.deviceTime,{replayed:false}));
  });
  router.post('/pair/actions',...parse,(req,res)=>{
    const {action,revision,idempotencyKey}=req.body||{};
    const keys=['action','revision','idempotencyKey','pairId'];
    const hasNetworkDeclaration = Object.hasOwn(req.body || {}, 'networkDeclaration');
    if (action==='accept') {
      keys.push('scope');
      if (hasNetworkDeclaration) keys.push('networkDeclaration');
    }
    if (action==='reply' || action==='ack') keys.push('messageId');
    if (!['accept','challenge','reply','ack','close'].includes(action) || !exact(req.body,keys)
        || !Number.isSafeInteger(revision) || revision<1 || !isId(idempotencyKey) || !isId(req.body.pairId)
        || (action==='accept' && (req.body.scope!==SCOPE || (hasNetworkDeclaration
          && (!exact(req.body.networkDeclaration, NETWORK_FIELDS) || !NETWORK_FIELDS.every(field => req.body.networkDeclaration[field] === true)))))
        || ((action==='reply'||action==='ack')&&!isId(req.body.messageId))) throw failure(400,'DEVICE_INVALID_BODY');
    const {key,session}=readSession(req);csrf(req,session);
    const canonical=JSON.stringify(keys.map(name=>[name,name==='networkDeclaration'
      ? NETWORK_FIELDS.map(field=>[field,req.body.networkDeclaration[field]]) : req.body[name]]));
    if (action==='close' && session.lastClose?.key===idempotencyKey) {
      if (session.lastClose.fingerprint!==canonical) throw failure(409,'DEVICE_IDEMPOTENCY_CONFLICT');
      return res.json({...session.lastClose.receipt,replayed:true});
    }
    const pair=pairFor(key,session), role=pair.a===key?'A':'B';
    if (req.body.pairId !== pair.id) throw failure(404,'DEVICE_PAIR_NOT_FOUND');
    if (action==='accept' && hasNetworkDeclaration !== (pair.scenario===MOBILE_SCENARIO)) throw failure(400,'DEVICE_INVALID_BODY');
    if (action!=='close') {globalRate(globalWrites,512,res.locals.deviceTime);rate(session,res.locals.deviceTime);}
    const prior=pair.commands.get(key+':'+idempotencyKey);
    if (prior) {
      if (prior.fingerprint!==canonical) throw failure(409,'DEVICE_IDEMPOTENCY_CONFLICT');
      return res.json(response(pair,key,res.locals.deviceTime,{replayed:true,...prior.result}));
    }
    if (pair.state==='CLOSED') throw failure(410,'DEVICE_PAIR_CLOSED');
    if (action!=='close' && pair.revision!==revision) throw failure(409,'DEVICE_REVISION_CONFLICT');
    if (pair.commands.size>=128 && action!=='close') throw failure(429,'DEVICE_COMMAND_LIMIT');
    let result={};
    if (action==='close') {
      const proof={version:'RIO_DEVICE_RECEIPT_V1',mode:'TEST_ONLY',buildCommit,pairId:pair.id,scenario:pair.scenario,
        closedAt:new Date(res.locals.deviceTime).toISOString(),evidence:evidence(pair),accounts:'CLOSED',endToEndEncrypted:false};
      removePair(pair);
      const receipt=response(pair,key,res.locals.deviceTime,{replayed:false,receipt:proof});
      session.lastClose={key:idempotencyKey,fingerprint:canonical,expiresAt:res.locals.deviceTime+pairTtlMs,receipt};
      return res.json(receipt);
    }
    else if (action==='accept') {
      if (pair.state!=='WAITING_ACCEPT' || pair.accepted[role]) throw failure(409,'DEVICE_INVALID_TRANSITION');
      pair.accepted[role]=true;
      pair.networkDeclared[role]=pair.scenario===MOBILE_SCENARIO;
      if (pair.accepted.A && pair.accepted.B) pair.state='ACTIVE_TEST';
      pair.revision+=1;
    } else {
      if (pair.state!=='ACTIVE_TEST') throw failure(409,'DEVICE_BILATERAL_ACCEPTANCE_REQUIRED');
      const message=pair.messages.find(item=>item.id===req.body.messageId);
      if (action==='ack') {
        if (!message || message.from===role) throw failure(404,'DEVICE_MESSAGE_NOT_FOUND');
        if (!message.acknowledged) { message.acknowledged=true;pair.revision+=1; }
        result={messageId:message.id};
      } else {
        if (pair.messages.length>=maxMessages) throw failure(429,'DEVICE_MESSAGE_LIMIT');
        if (action==='reply' && (!message || message.kind!=='CHALLENGE' || message.from===role
            || !message.acknowledged || pair.messages.some(item=>item.replyTo===message.id))) throw failure(409,'DEVICE_REPLY_REJECTED');
        const item={id:identifier(),sequence:pair.messages.length+1,from:role,
          kind:action==='challenge'?'CHALLENGE':'REPLY',code:action==='challenge'?identifier():message.code,
          replyTo:action==='reply'?message.id:null,acknowledged:false};
        pair.messages.push(item);pair.revision+=1;result={messageId:item.id};
      }
    }
    pair.commands.set(key+':'+idempotencyKey,{fingerprint:canonical,result});
    res.json(response(pair,key,res.locals.deviceTime,{replayed:false,...result}));
  });
  router.post('/session/end',...parse,(req,res)=>{
    if (!exact(req.body,[])) throw failure(400,'DEVICE_INVALID_BODY');
    const {key,session}=readSession(req);csrf(req,session);
    const pair=pairs.get(session.pairId);if(pair)removePair(pair);
    session.csrf='';session.keys.clear();sessions.delete(key);
    res.set('Set-Cookie',cookieName+'=; Max-Age=0'+attributes);res.json({ended:true,mode:'TEST_ONLY'});
  });
  router.use((req,res)=>res.status(404).json({error:'DEVICE_NOT_FOUND'}));
  router.use((error,req,res,next)=>{
    if (res.headersSent) return next(error);
    const status=error.deviceStatus || (error.type==='entity.too.large'?413:error.type==='encoding.unsupported'?415:400);
    res.status(status).json({error:error.deviceCode || (status===413?'DEVICE_BODY_TOO_LARGE':'DEVICE_INVALID_JSON')});
  });
  app.use(PREFIX,router);mounted.add(app);
  const timer=setInterval(()=>{try{cleanup(clock());}catch{for(const pair of pairs.values())removePair(pair);sessions.clear();}},1000);
  timer.unref();
  return { close(){ clearInterval(timer);for(const pair of pairs.values())removePair(pair);sessions.clear();stopped=true; } };
}
