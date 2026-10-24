import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','en','de','fr','es','ar','zh'];
const subjects={
  symbol:{id:'rio:subject:palaco-symbol',type:'SYMBOL',state:'CURRENT',preview:'asset:palaco-symbol',provenance:'rio-web-subject-catalog-v1'},
  image:{id:'rio:subject:rio-image',type:'IMAGE',state:'CURRENT',preview:'asset:rio-icon-192',provenance:'rio-web-subject-catalog-v1'},
  photo:{id:'rio:subject:meeting-place-illustration',type:'ILLUSTRATION',state:'DESIGN_ONLY',preview:'asset:rio-css-landscape',provenance:'rio-local-css-landscape-v1'},
  elixer:{id:'rio:subject:example-elixer',type:'ELIXER',state:'CURRENT',preview:'elixer:example-world:preview',provenance:'rio-web-subject-catalog-v1',object:'elixer:example-world'},
};
const privateMemory='TST-subject: Mijn afspraak is dinsdag om tien uur.';
let fixture,surface,source,startedAt;
test.beforeEach(async({},info)=>{
  startedAt=performance.now();
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['app.js','chat-preview.mjs','rio-engine-web.mjs','engine.mjs','index.html'])
    source[file+'Sha256']=createHash('sha256').update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function evidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-subject-dialog-lifecycle/1',project:test.info().project.name,
    observedAtUtc:new Date().toISOString(),elapsedMilliseconds:Math.round(performance.now()-startedAt),source,observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}
async function checkedContext(browser){
  const context=await browser.newContext({...surface,locale:'nl-NL'}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin?route.continue():route.abort('blockedbyclient');
  });
  return {context,async verify(page,language){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null
      ||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
      session:Object.fromEntries(Object.entries(sessionStorage))})))
      .toEqual({local:{},session:{'palaco-language':language}});
    for(const request of requests)expect(decodeURIComponent(request.url)).not.toContain(privateMemory);
    expect(context.pages()).toHaveLength(1);
  }};
}
async function prepare(page){
  await page.goto(fixture.origin+'/');
  await page.locator('#memory-input').fill(privateMemory);
  await page.locator('#memory-consent').check();
  await activate(page,'#memory-form button[type="submit"]');
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
  await page.locator('#question-input').fill('Wanneer is mijn afspraak?');
  await activate(page,'#question-form button[type="submit"]');
  await expect(page.locator('#engine-answer-text')).toHaveText(privateMemory);
  await page.locator('#memory-input').fill('TST-subject-Engine-draft');
  await page.locator('#question-input').fill('TST-subject-question-draft');
  await activate(page,'[data-subject="elixer"]');
  await activate(page,'#subject-continue');
  await expect(page.locator('#chat-preview-input')).toBeFocused();
  await page.locator('#chat-preview-input').fill('TST-subject-private-history');
  await activate(page,'#chat-preview-send');
  await page.locator('#chat-preview-input').fill('TST-subject-chat-draft');
}
async function work(page){
  return page.evaluate(()=>{
    const value=id=>document.getElementById(id).value;
    return {history:[...document.querySelector('#chat-preview-messages').children].map(item=>item.outerHTML),
      draft:value('chat-preview-input'),subject:document.querySelector('#chat-preview-subject').outerHTML,
      followups:document.querySelector('#chat-preview-followups').outerHTML,
      engine:{memory:value('memory-input'),question:value('question-input'),
        consent:document.querySelector('#memory-consent').checked,
        questionDisabled:document.querySelector('#question-input').disabled,
        dossier:document.querySelector('#dossier-output').outerHTML,answer:document.querySelector('#engine-answer').outerHTML}};
  });
}
async function observeDismiss(page){
  await page.evaluate(()=>{
    const dialog=document.querySelector('#subject-dialog'),events=[];
    const read=phase=>({phase,open:dialog.open,focus:document.activeElement.id,
      subject:document.activeElement.dataset.subject||null});
    window.__rioSubjectClose=new Promise(resolve=>{
      // Capture the browser's real queued close event. The later public focus
      // action must survive any application bubble listener for that old close.
      dialog.addEventListener('close',event=>{
        events.push({...read('capture-before-focus'),trusted:event.isTrusted});
        document.querySelector('#engine-clear').focus({preventScroll:true});
        events.push(read('capture-after-focus'));
      },{capture:true,once:true});
      dialog.addEventListener('close',()=>{events.push(read('after-application-close'));resolve(events);},{once:true});
    });
  });
}

test('native subject dismissals preserve private work and respect later public focus in Dutch and Arabic',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await prepare(page);
    for(const language of ['nl','ar']){
      await activate(page,'.lang-btn[data-lang="'+language+'"]');
      const before=await work(page);
      for(const subject of Object.keys(subjects))for(const action of ['close','escape','backdrop']){
        await activate(page,'[data-subject="'+subject+'"]');
        await expect(page.locator('#subject-dialog')).toBeVisible();
        await observeDismiss(page);
        if(action==='close')await activate(page,'#subject-close');
        else if(action==='escape')await page.keyboard.press('Escape');
        else{
          const box=await page.locator('#subject-dialog').boundingBox();
          // This is a real mouse click in the UA backdrop, outside the sheet.
          expect(box.y).toBeGreaterThan(4);
          await page.mouse.click(surface.viewport.width/2,2);
        }
        const events=await page.evaluate(()=>window.__rioSubjectClose);
        observations.push({language,subject,action,events,before,after:await work(page)});
      }
    }
    await checked.verify(page,'ar');
    await evidence('subject-native-dismiss',observations);
    for(const result of observations){
      expect(result.events[0]).toMatchObject({open:false,trusted:true,subject:result.subject});
      expect(result.events[1].focus).toBe('engine-clear');
      expect(result.events[2].focus).toBe('engine-clear');
      expect(result.after).toEqual(result.before);
    }
  }finally{
    try{await evidence('subject-native-dismiss-final',observations);}finally{await checked.context.close();}
  }
});

async function continueTwice(page,next){
  return page.evaluate(async({next})=>{
    const dialog=document.querySelector('#subject-dialog'),events=[],selections=[];
    const read=()=>({open:dialog.open,focus:document.activeElement.id,focusedSubject:document.activeElement.dataset.subject||null,
      panelHidden:document.querySelector('#chat-preview-panel').hidden,
      draft:document.querySelector('#chat-preview-input').value,
      title:document.querySelector('#chat-preview-subject-title').textContent,
      followups:document.querySelector('#chat-preview-followup-buttons').childElementCount,
      metadata:{id:dialog.dataset.subjectId,type:dialog.dataset.subjectType,state:dialog.dataset.subjectState,
        preview:dialog.dataset.previewReference,provenance:dialog.dataset.provenanceReference,
        effect:dialog.dataset.presentationEffect,object:dialog.dataset.objectReference||null}});
    const selected=event=>selections.push(event.detail);
    window.addEventListener('rio:subjectchange',selected);
    const closed=new Promise(resolve=>{
      const listener=event=>{events.push({...read(),trusted:event.isTrusted});if(events.length===2){dialog.removeEventListener('close',listener);resolve();}};
      dialog.addEventListener('close',listener);
    });
    // Real button activation closes the native dialog synchronously. Reopening
    // and continuing another public tile before either UA close event exposes
    // stale per-dialog focus/continuation state without synthetic events.
    document.querySelector('#subject-continue').click();
    const first=read();
    document.querySelector('[data-subject="'+next+'"]').click();
    document.querySelector('#subject-continue').focus();
    const reopened=read();
    document.querySelector('#subject-continue').click();
    const second=read();
    document.querySelector('#memory-input').focus({preventScroll:true});
    const beforeQueuedClose=read();
    await closed;
    const afterQueuedClose=read();
    window.removeEventListener('rio:subjectchange',selected);
    return {first,reopened,second,beforeQueuedClose,afterQueuedClose,events,selections};
  },{next});
}

test('continuing subjects finishes in its activation turn and stale native closes cannot steal newer focus or selection',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await prepare(page);
    const keys=Object.keys(subjects);
    for(const language of languages){
      await activate(page,'.lang-btn[data-lang="'+language+'"]');
      const before=await work(page);
      for(let index=0;index<keys.length;index++){
        const subject=keys[index],next=keys[(index+1)%keys.length];
        await activate(page,'[data-subject="'+subject+'"]');
        await expect(page.locator('#subject-dialog')).toBeVisible();
        const result=await continueTwice(page,next);
        const after=await work(page);
        observations.push({language,subject,next,result,before:{history:before.history,draft:before.draft,engine:before.engine},
          after:{history:after.history,draft:after.draft,engine:after.engine}});
      }
    }
    await checked.verify(page,'zh');
    await evidence('subject-continue-native-close',observations);
    for(const observation of observations){
      const {subject,next,result}=observation;
      for(const [selection,key] of [[result.first,subject],[result.second,next]]){
        expect(selection.open).toBe(false);expect(selection.focus).toBe('chat-preview-input');
        expect(selection.panelHidden).toBe(false);expect(selection.draft).toBe('TST-subject-chat-draft');
        expect(selection.metadata).toEqual({...subjects[key],object:subjects[key].object||null,effect:'NONE'});
        expect(selection.followups).toBe(key==='elixer'?3:0);
        expect(selection.title.trim().length).toBeGreaterThan(0);
      }
      expect(result.reopened).toMatchObject({open:true,focus:'subject-continue',panelHidden:true});
      expect(result.selections.map(selection=>({id:selection.id,openChat:selection.openChat,questions:selection.questions.length})))
        .toEqual([subject,next].map(key=>({id:subjects[key].id,openChat:true,questions:key==='elixer'?3:0})));
      expect(result.events).toHaveLength(2);for(const event of result.events)expect(event.trusted).toBe(true);
      expect(result.afterQueuedClose).toEqual(result.beforeQueuedClose);
      expect(result.afterQueuedClose.focus).toBe('memory-input');
      expect(observation.after).toEqual(observation.before);
    }
  }finally{
    try{await evidence('subject-continue-native-close-final',observations);}finally{await checked.context.close();}
  }
});

