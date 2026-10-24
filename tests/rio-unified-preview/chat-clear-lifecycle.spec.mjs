import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const welcome='مرحباً! أنا RIO. يمكنك سؤالي عن RIO أو هذه المعاينة.';
const memory='TST-chat-clear: Mijn afspraak is dinsdag om tien uur.';
let fixture,surface,source;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['chat-preview.mjs','integration.mjs','index.html'])
    source[file+'Sha256']=createHash('sha256').update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function checkedContext(browser){
  const context=await browser.newContext({...surface,locale:'nl-NL'}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin
      ?route.continue():route.abort('blockedbyclient');
  });
  return {context,async verify(page){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null
      ||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
      session:Object.fromEntries(Object.entries(sessionStorage))})))
      .toEqual({local:{},session:{'palaco-language':'ar'}});
    expect(context.pages()).toHaveLength(1);
  }};
}
async function evidence(name,observations){
  const value={schema:'rio-chat-clear-lifecycle/1',project:test.info().project.name,source,observations};
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify(value,null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}
async function prepare(page){
  await page.goto(fixture.origin+'/');
  await page.locator('#memory-input').fill(memory);
  await page.locator('#memory-consent').check();
  await activate(page,'#memory-form button[type="submit"]');
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
  await page.locator('#question-input').fill('Wanneer is mijn afspraak?');
  await activate(page,'#question-form button[type="submit"]');
  await expect(page.locator('#engine-answer-text')).toHaveText(memory);
  await page.locator('#memory-input').fill('TST-Engine-draft-stays');
  await page.locator('#question-input').fill('TST-Engine-question-stays');
  await page.locator('#memory-consent').check();
  await activate(page,'.lang-btn[data-lang="ar"]');
  await activate(page,'[data-subject="elixer"]');
  await expect(page.locator('#subject-dialog')).toBeVisible();
  await activate(page,'#subject-continue');
  await expect(page.locator('#chat-preview-panel')).toBeVisible();
  await page.locator('#chat-preview-input').fill('TST-old-chat-message');
  await activate(page,'#chat-preview-send');
  await page.locator('#chat-preview-input').fill('TST-old-chat-draft');
}
async function openClear(page){
  await activate(page,'#chat-preview-clear');
  await expect(page.locator('#chat-preview-clear-dialog')).toBeVisible();
  await expect(page.locator('#chat-preview-clear-dialog form')).toHaveAttribute('method','dialog');
  await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
}
async function snapshot(page){
  return page.evaluate(()=>{
    const value=id=>document.getElementById(id).value;
    const text=id=>document.getElementById(id).textContent;
    return {history:[...document.querySelector('#chat-preview-messages').children].map(item=>item.outerHTML),
      draft:value('chat-preview-input'),subject:document.querySelector('#chat-preview-subject').outerHTML,
      engine:{memory:value('memory-input'),question:value('question-input'),
        consent:document.querySelector('#memory-consent').checked,
        questionDisabled:document.querySelector('#question-input').disabled,
        dossier:document.querySelector('#dossier-output').outerHTML,
        answer:document.querySelector('#engine-answer').outerHTML},
      status:text('chat-preview-status')};
  });
}
async function confirmAndContinue(page,reopen){
  // HTMLButtonElement.click performs the real form activation and native
  // dialog close. A following public-control action in the same task exposes
  // the interval before the browser dispatches its queued close event.
  return page.evaluate(async({reopen})=>{
    const dialog=document.querySelector('#chat-preview-clear-dialog');
    const input=document.querySelector('#chat-preview-input');
    const log=document.querySelector('#chat-preview-messages');
    const read=()=>({open:dialog.open,returnValue:dialog.returnValue,
      focus:document.activeElement.id,draft:input.value,
      history:[...log.children].map(item=>item.outerHTML),
      count:log.childElementCount,visitors:log.querySelectorAll('.is-visitor').length,
      welcome:{text:log.firstElementChild?.querySelector('p')?.textContent,
        lang:log.firstElementChild?.lang,dir:log.firstElementChild?.dir},
      subject:{hidden:document.querySelector('#chat-preview-subject').hidden,
        open:document.querySelector('#chat-preview-subject').open,
        fields:[...document.querySelector('#chat-preview-subject').querySelectorAll('p,dd,strong')].map(node=>node.textContent)},
      followups:{hidden:document.querySelector('#chat-preview-followups').hidden,
        open:document.querySelector('#chat-preview-followups').open,
        count:document.querySelector('#chat-preview-followup-buttons').childElementCount},
      readingHidden:document.querySelector('#chat-preview-reading').hidden,
      inputInvalid:input.getAttribute('aria-invalid'),inputErrorHidden:document.querySelector('#chat-preview-input-error').hidden});
    const closed=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(read()),{once:true}));
    document.querySelector('#chat-preview-clear-confirm').click();
    const synchronous=read();
    if(!reopen)document.querySelector('[data-chat-prompt="about"]').click();
    input.value=reopen?'TST-new-draft-before-reopen':'TST-new-draft-before-old-close';
    if(reopen)document.querySelector('#chat-preview-clear').click();
    else document.querySelector('#memory-input').focus({preventScroll:true});
    const beforeQueuedClose=read();
    const afterQueuedClose=await closed;
    return {reopen,synchronous,beforeQueuedClose,afterQueuedClose};
  },{reopen});
}

test('chat confirmation finishes before its native close event and cannot erase newer work or a reopened choice',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await prepare(page);
    const engine=(await snapshot(page)).engine;
    await openClear(page);
    const continued=await confirmAndContinue(page,false);observations.push(continued);
    // Exercise a second confirmation with a new dialog opened before the old
    // native close event. Its current cancel choice must remain untouched.
    await openClear(page);
    const reopened=await confirmAndContinue(page,true);observations.push(reopened);
    const after=(await snapshot(page)).engine;
    await evidence('chat-confirm-close-lifecycle',observations);
    for(const result of [continued,reopened]){
      expect(result.synchronous.open).toBe(false);
      expect(result.synchronous.focus).toBe('chat-preview-input');
      expect(result.synchronous.draft).toBe('');
      expect(result.synchronous.count).toBe(1);expect(result.synchronous.visitors).toBe(0);
      expect(result.synchronous.welcome).toEqual({text:welcome,lang:'ar',dir:'rtl'});
      expect(result.synchronous.subject).toEqual({hidden:true,open:false,
        fields:result.synchronous.subject.fields.map(()=> '')});
      expect(result.synchronous.followups).toEqual({hidden:true,open:false,count:0});
      expect(result.synchronous.readingHidden).toBe(true);
      expect(result.synchronous.inputInvalid).toBe(null);expect(result.synchronous.inputErrorHidden).toBe(true);
      expect(result.afterQueuedClose).toEqual(result.beforeQueuedClose);
    }
    expect(continued.afterQueuedClose.count).toBe(3);
    expect(continued.afterQueuedClose.visitors).toBe(1);
    expect(continued.afterQueuedClose.focus).toBe('memory-input');
    expect(continued.afterQueuedClose.draft).toBe('TST-new-draft-before-old-close');
    expect(reopened.afterQueuedClose.open).toBe(true);
    expect(reopened.afterQueuedClose.focus).toBe('chat-preview-clear-cancel');
    expect(reopened.afterQueuedClose.draft).toBe('TST-new-draft-before-reopen');
    expect(after).toEqual(engine);
    await page.keyboard.press('Escape');
    await expect(page.locator('#chat-preview-clear-dialog')).not.toBeVisible();
    await expect(page.locator('#chat-preview-clear')).toBeFocused();
    await expect(page.locator('#chat-preview-input')).toHaveValue('TST-new-draft-before-reopen');
    expect((await snapshot(page)).engine).toEqual(engine);
    await checked.verify(page);
  }finally{
    try{await evidence('chat-confirm-close-lifecycle-final',observations);}finally{await checked.context.close();}
  }
});

test('chat cancel and Escape preserve work and respect a later control focused during native close capture',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await prepare(page);
    const before=await snapshot(page);
    for(const action of ['cancel','escape']){
      await openClear(page);
      await page.evaluate(()=>{
        const dialog=document.querySelector('#chat-preview-clear-dialog');
        const next=document.querySelector('#engine-clear');
        const events=[];
        window.__rioChatClearClose=new Promise(resolve=>{
          // These are listeners on the browser's actual close event, never a
          // synthetic event. Interleave one later public-control focus action
          // before the application's queued bubble listener can run.
          dialog.addEventListener('close',()=>{
            events.push({phase:'capture-before-focus',focus:document.activeElement.id,open:dialog.open});
            next.focus({preventScroll:true});
            events.push({phase:'capture-after-focus',focus:document.activeElement.id,open:dialog.open});
          },{capture:true,once:true});
          dialog.addEventListener('close',()=>{
            events.push({phase:'after-application-close',focus:document.activeElement.id,open:dialog.open});
            resolve(events);
          },{once:true});
        });
      });
      if(action==='cancel')await activate(page,'#chat-preview-clear-cancel');
      else await page.keyboard.press('Escape');
      const events=await page.evaluate(()=>window.__rioChatClearClose);
      const after=await snapshot(page);observations.push({action,events,before,after});
    }
    await evidence('chat-cancel-close-lifecycle',observations);
    for(const observation of observations){
      expect(observation.events[0].open).toBe(false);
      expect(observation.events[1].focus).toBe('engine-clear');
      expect(observation.events[2].focus).toBe('engine-clear');
      expect(observation.after).toEqual(before);
    }
    await expect(page.locator('#engine-clear')).toBeFocused();
    await expect(page.locator('#chat-preview-panel')).toBeVisible();
    await checked.verify(page);
  }finally{
    try{await evidence('chat-cancel-close-lifecycle-final',observations);}finally{await checked.context.close();}
  }
});
