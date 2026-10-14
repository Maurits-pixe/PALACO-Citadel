'use strict';
(() => {
  const API = '/api/rio/device-test';
  const SCOPE = 'RIO_DEVICE_CHALLENGE_V1';
  let incoming = '';
  try {
    const match = /^#invite=([a-f0-9]{64})$/.exec(location.hash);
    if (match) incoming = match[1];
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  } catch {}
  let csrf = '', pair = null, link = '', pending = null, busy = false, ready = false, hasPair = false, deadline = 0, looked = false;
  let epoch = 0, closing = false, closedReport = null;
  function bindPair(data) {
    if(pair && pair.id===data.pair.id && data.pair.revision<pair.revision) return false;
    const changed=!pair || pair.id!==data.pair.id || pair.revision!==data.pair.revision;
    pair=data.pair;
    deadline=performance.now()+Math.max(0,Date.parse(pair.expiresAt)-Date.parse(data.serverTime)-1000);
    return changed;
  }
  function forgetPair(clearInvitation=true) {
    epoch+=1;pair=null;link='';if(clearInvitation)incoming='';pending=null;deadline=0;closing=false;
    $('messages').replaceChildren();$('proof').hidden=true;$('share-link').value='';if(clearInvitation)$('invitation').value='';
  }
  const $ = id => document.getElementById(id);
  const feedback = text => { $('feedback').textContent = text; };
  const key = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const labels = {WAITING_PEER:'Wachten op telefoon B',WAITING_ACCEPT:'Bevestig deelname op beide telefoons',ACTIVE_TEST:'De testcodeproef is actief',CLOSED:'Deze proef is gesloten'};
  async function request(path, body) {
    const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),8000);
    try {
      const response = await fetch(API+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
        headers:body===undefined?{}:{'Content-Type':'application/json',...(csrf?{'X-Device-Test-CSRF':csrf}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:abort.signal});
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error('Request rejected'),{status:response.status});
      return data;
    } finally {clearTimeout(timer);}
  }
  // Downloaded results contain deliberately enumerated fields, not server messages.
  // The exact closed pair must be confirmed before this can return any result.
  function safeCarrierReport(data, expectedId) {
    const p=data?.pair, raw=data?.carrierResult;
    if (!p || p.id!==expectedId || p.state!=='CLOSED' || !raw ||
        raw.schema!=='rio-carrier-result/v1' || raw.pairId!==expectedId ||
        raw.network!=='KPN' || raw.providers?.A!=='Youfone' || raw.providers?.B!=='Lebara' ||
        raw.physicalCarrierVerified!==false ||
        !Number.isSafeInteger(p.revision) || !Number.isFinite(Date.parse(raw.closedAt)) ||
        !['A','B'].includes(p.role) ||
        !['A','B'].every(role=>typeof raw.declarations?.[role]==='boolean' && typeof raw.consent?.[role]==='boolean') ||
        !['challengeReceived','replyReceived','roundTripConfirmed'].every(k=>typeof raw[k]==='boolean') ||
        (raw.replyReceived && !raw.challengeReceived) ||
        (raw.roundTripConfirmed!==Boolean(raw.challengeReceived && raw.replyReceived))) return null;
    return {
      schema:'rio-carrier-result/v1', testId:expectedId,
      closedRevision:p.revision, closedAt:raw.closedAt, network:'KPN',
      providers:{A:'Youfone',B:'Lebara'}, physicalCarrierVerified:false,
      declarations:{A:raw.declarations.A,B:raw.declarations.B},
      consent:{A:raw.consent.A,B:raw.consent.B},
      challengeReceived:raw.challengeReceived,replyReceived:raw.replyReceived,
      roundTripConfirmed:raw.roundTripConfirmed, account1:'HOLD', canOpenContact:false,
      operativeAuthority:'NONE', evidence:'server-ack-and-self-declarations-not-carrier-detection'
    };
  }
  function countdown() {
    if (!pair) return;
    const left = Math.max(0, Math.ceil((deadline-performance.now())/1000));
    $('expiry').textContent = 'Verloopt uiterlijk om '+new Date(pair.expiresAt).toLocaleTimeString('nl-NL')+' ('+left+' seconden).';
  }
  function render() {
    $('setup').hidden = Boolean(pair) || !ready;
    $('create').disabled = busy || Boolean(pending);
    $('join').disabled = busy || Boolean(pending);
    $('retry').hidden = !pending; $('retry').disabled = busy;
    $('pair-panel').hidden = !pair;
    $('invitation-panel').hidden = !link || !pair || pair.state!=='WAITING_PEER';
    $('share-link').value = link;
    $('messages').replaceChildren();$('proof').hidden=true;
    $('download-result').hidden=!closedReport;
    if (!pair) return;
    $('pair-title').textContent = 'Telefoon '+pair.role+' · proef '+pair.id.slice(0,8);
    $('state').textContent = labels[pair.state] || 'Onbekende proefstatus';
    countdown();
    $('consent').textContent = 'Telefoon A: '+(pair.consent.A?'deelname bevestigd':'nog niet bevestigd')+' · Telefoon B: '+(pair.consent.B?'deelname bevestigd':'nog niet bevestigd');
    const mine = pair.consent[pair.role];
    $('accept').hidden = pair.state!=='WAITING_ACCEPT' || mine;
    $('accept').disabled = busy || Boolean(pending);
    $('carrier-panel').hidden=pair.state!=='ACTIVE_TEST';
    const carrier=pair.carrier || {mode:false,A:false,B:false};
    $('carrier-title').textContent='Telefoon '+pair.role+' · '+(pair.role==='A'?'Youfone':'Lebara')+' (KPN)';
    $('carrier-status').textContent='Netwerkverklaring A / Youfone: '+(carrier.A?'bevestigd':'ontbreekt')+
      ' · B / Lebara: '+(carrier.B?'bevestigd':'ontbreekt')+
      '. Dit is een eigen verklaring, geen automatische netwerkcontrole.';
    $('carrier-confirm').disabled=busy || Boolean(pending) || Boolean(carrier[pair.role]) ||
      !['wifi-off','data-on','providers-different','hotspot-off'].every(id=>$(id).checked);
    $('carrier-confirm').hidden=Boolean(carrier[pair.role]);
    $('challenge').hidden = pair.state!=='ACTIVE_TEST';
    $('challenge').disabled = busy || Boolean(pending) || closing ||
      Boolean(carrier.mode && !(carrier.A && carrier.B));
    $('close').disabled = busy || Boolean(pending) || pair.state==='CLOSED';
    $('messages').replaceChildren();
    if (closing) return; // A delayed response may never redraw wiped codes.
    for (const message of pair.messages) {
      const li=document.createElement('li'),title=document.createElement('strong'),code=document.createElement('code'),status=document.createElement('small');
      title.textContent='#'+message.sequence+' · '+(message.from===pair.role?'Verstuurd':'Ontvangen')+' · '+(message.kind==='CHALLENGE'?'testcode':'antwoord');
      code.textContent=message.code;status.textContent=message.acknowledged?'Ontvangst bevestigd door de andere browser':'Ontvangst nog niet bevestigd';
      li.append(title,code,status);
      if (message.from!==pair.role && !message.acknowledged && pair.state==='ACTIVE_TEST') {
        const button=document.createElement('button');button.textContent='Ik zie deze code · bevestig ontvangst';
        button.disabled=busy || Boolean(pending);button.dataset.ack=message.id;button.addEventListener('click',()=>action('ack',{messageId:message.id}));li.append(button);
      }
      if (message.from!==pair.role && message.kind==='CHALLENGE' && message.acknowledged && !pair.messages.some(m=>m.replyTo===message.id) && pair.state==='ACTIVE_TEST') {
        const button=document.createElement('button');button.textContent='Antwoord met dezelfde testcode';
        button.disabled=busy || Boolean(pending);button.dataset.reply=message.id;button.addEventListener('click',()=>action('reply',{messageId:message.id}));li.append(button);
      }
      $('messages').append(li);
    }
    const proven = pair.messages.some(m=>m.kind==='CHALLENGE' && m.acknowledged &&
      pair.messages.some(reply=>reply.replyTo===m.id && reply.code===m.code && reply.acknowledged));
    $('proof').hidden=!proven;
  }
  async function refresh() {
    if (!ready || busy || closing || pending || (looked && !pair && !hasPair)) return;
    const started=epoch;
    try {
      const data=await request('/pair');
      if(started!==epoch || closing || busy) return;
      looked=true;const changed=bindPair(data);hasPair=true;
      if (pair.state!=='WAITING_PEER') link='';
      if (pair.state==='CLOSED') feedback('De proef is gesloten. De testcodes zijn gewist. Vernieuw de pagina om een nieuwe proef te starten.');
      else if(pair.state==='WAITING_PEER'&&!link)feedback('De uitnodiging wordt niet opnieuw getoond. Gebruik je eerder gekopieerde link, of sluit deze proef en begin opnieuw.');
      if(changed)render();else countdown();
    } catch(error) {
      if(started!==epoch || closing || busy) return;
      if (error.status===404) {
        looked=true;forgetPair(hasPair);render();
        if (hasPair) {feedback('De proef is verlopen of beëindigd. De testcodes zijn gewist.');hasPair=false;}
      } else if (error.status===401) {
        ready=false;forgetPair();csrf='';render();feedback('Je tijdelijke testsessie is verlopen. Vernieuw deze pagina.');
      } else feedback('De server is tijdelijk niet bereikbaar. Aflevering is nog niet bevestigd.');
    }
  }
  async function submit(path,body) {
    if (busy) return;
    pending={path,body};await retry();
  }
  async function retry() {
    if (!pending || busy) return;
    const started=epoch;
    busy=true;render();
    try {
      const attempt=pending;
      const data=await request(attempt.path,attempt.body);
      if(started!==epoch) return; // Ignore effects after local expiry or erasure.
      if(attempt.body?.action==='close') {
        // Accept no old, foreign or nonclosed response as export authority.
        const candidate=safeCarrierReport(data,attempt.body.pairId);
        if(!candidate || !pair || pair.id!==attempt.body.pairId) throw new Error('Invalid closure');
        const carrierWasUsed=Boolean(pair.carrier?.mode);
        forgetPair();closedReport=carrierWasUsed?candidate:null;
        closing=false;hasPair=false;looked=true;
        feedback('De proef is afgesloten. Testcodes en sleutels zijn gewist. Het resultaat bevat geen codes.');
        return;
      }
      pending=null;
      if (data.pair) {
        bindPair(data);hasPair=true;
        if (data.inviteToken) {link=location.origin+location.pathname+'#invite='+data.inviteToken;}
        if (pair.state!=='WAITING_PEER') {link='';incoming='';$('invitation').value='';}
        feedback(pair.state==='CLOSED'?'De proef is gesloten. De testcodes zijn op de server gewist.':pair.state==='WAITING_PEER'&&!link?'De eerste reactie is niet ontvangen; de uitnodiging kan niet opnieuw worden opgehaald. Sluit deze proef en start een nieuwe.':labels[pair.state]);
      }
    } catch(error) {
      if(started!==epoch) return;
      if (error.status) {
        pending=null;
        if (closing) {forgetPair();closing=false;hasPair=false;looked=true;}
        if (error.status===409) feedback('De proefstand is gewijzigd. Kies je stap opnieuw; er is geen dubbele verzending uitgevoerd.');
        else if (error.status===401) {ready=false;forgetPair();csrf='';feedback('Je tijdelijke testsessie is verlopen. Vernieuw de pagina.');}
        else if (error.status===404 || error.status===410) feedback('De uitnodiging of proef is niet meer bruikbaar. Start op telefoon A een nieuwe proef.');
        else if (error.status===429 || error.status===503) feedback('De proefomgeving is tijdelijk vol. Wacht even en probeer opnieuw.');
        else feedback('Deze stap is geweigerd. Er is geen gewone account- of contacttoegang geopend.');
      } else feedback('Geen antwoord ontvangen. Gebruik “Dezelfde stap opnieuw proberen”; die herhaalt dezelfde verzending.');
    } finally {busy=false;render();if(!pending && !closing)await refresh();}
  }
  async function action(name,extra={}) {
    if (busy || pending || !pair) return;
    const intendedPair=pair.id;
    if(name==='close'){
      closing=true;epoch+=1;closedReport=null;
      pair.messages=[]; // Remove server-generated code values from memory immediately.
      $('messages').replaceChildren();$('proof').hidden=true;
    }
    const started=epoch;
    busy=true;render();
    try {
      const latest=await request('/pair');
      if(started!==epoch || !pair || pair.id!==intendedPair) {
        closing=false;busy=false;render();return;
      }
      bindPair(latest);busy=false;render();
      if(pair.id!==intendedPair) {
        feedback('Deze proef is gewijzigd. Controleer het proefnummer en kies je stap opnieuw.');return;
      }
      await submit('/pair/actions',{action:name,pairId:intendedPair,revision:pair.revision,idempotencyKey:key(),...extra});
    } catch {
      if(started!==epoch) return;
      if(closing){forgetPair();closing=false;hasPair=false;looked=true;}
      busy=false;render();feedback('De proefstand kon niet worden opgehaald. De zichtbare testcodes zijn gewist; controleer de serverstatus vóór een nieuwe proef.');
    }
  }
  $('create').addEventListener('click',()=>{closedReport=null;epoch+=1;submit('/pair',{idempotencyKey:key()});});
  $('join').addEventListener('click',()=>{
    let token=incoming;
    if (!token) {
      try { const value=$('invitation').value.trim();const url=new URL(value);if(url.origin===location.origin && url.pathname===location.pathname)token=/^#invite=([a-f0-9]{64})$/.exec(url.hash)?.[1]||'';} catch {}
    }
    if (!/^[a-f0-9]{64}$/.test(token)) return feedback('Open of plak de volledige uitnodigingslink van telefoon A.');
    incoming=token;$('invitation').value='';closedReport=null;epoch+=1;
    submit('/join',{inviteToken:token,idempotencyKey:key()});
  });
  $('accept').addEventListener('click',()=>action('accept',{scope:SCOPE}));
  for(const id of ['wifi-off','data-on','providers-different','hotspot-off']) {
    $(id).addEventListener('change',()=>{if(pair)render();});
  }
  $('carrier-confirm').addEventListener('click',()=>{
    if(!pair || !['wifi-off','data-on','providers-different','hotspot-off'].every(id=>$(id).checked)) return;
    action('carrier',{checks:{wifiOff:true,mobileDataOn:true,differentProviders:true,noHotspot:true}});
  });
  $('download-result').addEventListener('click',()=>{
    if(!closedReport) return;
    const text=JSON.stringify(closedReport,null,2)+'\n';
    const blob=new Blob([text],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='RIO-carrier-'+closedReport.testId.slice(0,8)+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('challenge').addEventListener('click',()=>action('challenge'));
  $('close').addEventListener('click',()=>action('close'));
  $('retry').addEventListener('click',retry);
  $('copy').addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(link);feedback('Link gekopieerd. Open hem op je eigen tweede telefoon.');}
    catch { $('share-link').focus();$('share-link').select();feedback('Kopieer de geselecteerde link en open hem op telefoon B.'); }
  });
  if (typeof navigator.share==='function') {$('share').hidden=false;$('share').addEventListener('click',async()=>{
    try {await navigator.share({title:'PALACO RIO apparaatproef',url:link});}catch{}
  });}
  if (incoming) {$('invitation').placeholder='Uitnodiging ontvangen; kies “Gebruik uitnodiging”.';feedback('Uitnodiging ontvangen.');}
  window.addEventListener('online',refresh);
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  window.addEventListener('pagehide',()=>{incoming='';link='';csrf='';pending=null;closedReport=null;epoch+=1;});
  (async()=>{
    try {
      const data=await request('/session',{});csrf=data.session.csrfToken;ready=true;
      $('build').textContent='TEST_ONLY · versie 0.1 · '+(data.runtime.buildCommit?data.runtime.buildCommit.slice(0,12):'lokale proef')+' · persoonlijke accounts gesloten';
      feedback(incoming?'Uitnodiging ontvangen. Kies op telefoon B “Gebruik uitnodiging”.':'Klaar. Maak op telefoon A een uitnodiging.');
      render();await refresh();setInterval(refresh,2000);
      setInterval(()=>{
        if (pair && deadline && performance.now()>=deadline) {
          forgetPair();hasPair=false;render();feedback('De apparaatproef is verlopen. De codes zijn uit deze pagina verwijderd.');
        } else if(pair) countdown();
      },1000);
    } catch {ready=false;render();feedback('De proefomgeving is niet bereikbaar. Vernieuw de pagina zodra de verbinding terug is.');}
  })();
})();