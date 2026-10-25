import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','pl','ar','pt','ru','eo','it'];
const shortScreens=[
  {width:430,height:280},{width:430,height:320},{width:320,height:320},
  {width:640,height:320},{width:844,height:320},
];
const privateDraft='TST-short-screen-private-chat-draft';
const privateHistory='TST-short-screen-private-history';
const privateMemory='TST-short-screen: Mijn afspraak is dinsdag om tien uur.';
let fixture,surface,source;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['styles.css','chat-preview.mjs'])
    source[file+'Sha256']=createHash('sha256').update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function checkedContext(browser){
  const context=await browser.newContext({...surface,locale:'nl-NL'}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin?route.continue():route.abort('blockedbyclient');
  });
  return {context,async verify(){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null
      ||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    for(const request of requests)for(const value of [privateDraft,privateHistory,privateMemory])
      expect(decodeURIComponent(request.url)).not.toContain(value);
    expect(await context.cookies()).toEqual([]);expect(context.pages()).toHaveLength(1);
  }};
}
async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function storage(page){return page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
  session:Object.fromEntries(Object.entries(sessionStorage))}));}
async function resize(page,width,height,font=32){
  const before=await storage(page);
  await page.setViewportSize({width,height});
  await page.evaluate(size=>{
    document.documentElement.style.fontSize=size+'px';document.body.style.fontSize=size+'px';
  },font);
  expect(await storage(page)).toEqual(before);
}
async function language(page,value){
  await activate(page,'.lang-btn[data-lang="'+value+'"]');
  await expect(page.locator('html')).toHaveAttribute('lang',value);
  await expect(page.locator('html')).toHaveAttribute('dir',value==='ar'?'rtl':'ltr');
}
async function mode(page,active){
  const panel=page.locator('#chat-preview-panel');
  if(active){
    await expect(panel).toHaveAttribute('role','dialog');
    await expect(panel).toHaveAttribute('aria-modal','true');
    await expect.poll(()=>page.locator('main').evaluate(element=>element.inert)).toBe(true);
    await expect.poll(()=>page.locator('.site-header').evaluate(element=>element.inert)).toBe(true);
    await expect(page.locator('.taskbar')).toBeHidden();
    await expect(page.locator('#chat-preview-toggle')).toBeHidden();
  }else{
    await expect(panel).not.toHaveAttribute('aria-modal','true');
    await expect(panel).not.toHaveAttribute('role','dialog');
    await expect.poll(()=>page.locator('.site-header').evaluate(element=>element.inert)).toBe(false);
    await expect(page.locator('.taskbar')).toBeVisible();
    await expect(page.locator('#chat-preview-toggle')).toBeVisible();
  }
}
async function focusedControl(page,selector){
  await expect(page.locator(selector)).toBeFocused();
  const measured=await page.locator(selector).evaluate(element=>{
    const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
      viewport:{width:document.documentElement.clientWidth,height:innerHeight},
      hit:element.contains(hit),focusVisible:element.matches(':focus-visible')};
  });
  expect(measured.width).toBeGreaterThanOrEqual(44);expect(measured.height).toBeGreaterThanOrEqual(44);
  expect(measured.left).toBeGreaterThanOrEqual(-1);expect(measured.right).toBeLessThanOrEqual(measured.viewport.width+1);
  expect(measured.top).toBeGreaterThanOrEqual(-1);expect(measured.bottom).toBeLessThanOrEqual(measured.viewport.height+1);
  expect(measured.hit).toBe(true);expect(measured.focusVisible).toBe(true);
  return measured;
}
async function panelGeometry(page){
  return page.locator('#chat-preview-panel').evaluate(panel=>{
    const r=panel.getBoundingClientRect();return {
      left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
      viewport:{width:document.documentElement.clientWidth,height:innerHeight},
      scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,
      scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,
      active:document.activeElement.id};
  });
}
async function evidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-short-screen-chat/1',project:test.info().project.name,
    source,observedAtUtc:new Date().toISOString(),observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}
async function work(page){
  return page.evaluate(()=>{
    const value=id=>document.getElementById(id).value;
    return {history:document.querySelector('#chat-preview-messages').innerHTML,
      draft:value('chat-preview-input'),subject:document.querySelector('#chat-preview-subject').outerHTML,
      followups:document.querySelector('#chat-preview-followups').outerHTML,
      engine:{memory:value('memory-input'),question:value('question-input'),
        consent:document.querySelector('#memory-consent').checked,
        questionDisabled:document.querySelector('#question-input').disabled,
        dossier:document.querySelector('#dossier-output').outerHTML,answer:document.querySelector('#engine-answer').outerHTML}};
  });
}
async function prepareWork(page){
  await page.goto(fixture.origin+'/');await resize(page,430,900);
  await page.locator('#memory-input').fill(privateMemory);await page.locator('#memory-consent').check();
  await activate(page,'#memory-form button[type="submit"]');
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
  await page.locator('#question-input').fill('Wanneer is mijn afspraak?');
  await activate(page,'#question-form button[type="submit"]');
  await expect(page.locator('#engine-answer-text')).toHaveText(privateMemory);
  await page.locator('#memory-input').fill('TST-short-screen-engine-draft');
  await page.locator('#question-input').fill('TST-short-screen-question-draft');
  await activate(page,'[data-subject="elixer"]');
  await page.evaluate(()=>{
    window.__rioPreparedSubjectClose=new Promise(resolve=>document.querySelector('#subject-dialog')
      .addEventListener('close',event=>resolve({open:event.target.open,trusted:event.isTrusted}),{once:true}));
  });
  await activate(page,'#subject-continue');
  expect(await page.evaluate(()=>window.__rioPreparedSubjectClose)).toEqual({open:false,trusted:true});
  await expect(page.locator('#chat-preview-input')).toBeFocused();
  await page.locator('#chat-preview-input').fill(privateHistory);await activate(page,'#chat-preview-send');
  await page.locator('#chat-preview-input').fill(privateDraft);
}
async function observeClearClose(page){
  await page.evaluate(()=>{
    window.__rioShortClearClosed=new Promise(resolve=>document.querySelector('#chat-preview-clear-dialog')
      .addEventListener('close',event=>resolve({open:event.target.open,trusted:event.isTrusted,
        focus:document.activeElement.id,returnValue:event.target.returnValue}),{once:true}));
  });
}

test('short screens keep large-text Close and Send reachable with bounded keyboard focus in seven languages',async({browser})=>{
  test.setTimeout(120000);
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await page.goto(fixture.origin+'/');
    for(const screen of shortScreens)for(const lang of languages)await test.step(screen.width+'x'+screen.height+' '+lang,async()=>{
      await resize(page,screen.width,900);await language(page,lang);
      await activate(page,'#chat-preview-toggle');await page.locator('#chat-preview-input').fill(privateDraft);
      const before=await storage(page);await resize(page,screen.width,screen.height);await mode(page,true);
      const geometry=await panelGeometry(page);
      expect(geometry.left).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.top).toBeGreaterThanOrEqual(0);expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.height).toBeGreaterThanOrEqual(geometry.viewport.height-18);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
      await page.locator('#chat-preview-title').focus();await page.keyboard.press('Tab');
      await expect(page.locator('#chat-preview-size')).toBeFocused();await page.keyboard.press('Tab');
      const close=await focusedControl(page,'#chat-preview-close');
      await page.locator('#chat-preview-input').focus();await page.keyboard.press('Tab');
      const send=await focusedControl(page,'#chat-preview-send');
      await page.keyboard.press('Tab');const clear=await focusedControl(page,'#chat-preview-clear');
      await page.keyboard.press('Tab');const first=await focusedControl(page,'#chat-preview-size');
      await page.keyboard.press('Shift+Tab');await expect(page.locator('#chat-preview-clear')).toBeFocused();
      await expect(page.locator('#chat-preview-input')).toHaveValue(privateDraft);
      expect(await storage(page)).toEqual(before);
      await page.keyboard.press('Escape');await expect(page.locator('#chat-preview-panel')).toBeHidden();
      await mode(page,false);await expect(page.locator('#chat-preview-toggle')).toBeFocused();
      expect(await page.locator('main').evaluate(element=>element.inert)).toBe(false);
      expect(await storage(page)).toEqual(before);
      observations.push({screen,language:lang,geometry,keyboard:{close,send,clear,first},escapeRestored:true});
    });
    await checked.verify();
  }finally{try{await evidence('short-screen-focus-matrix',observations);}finally{await checked.context.close();}}
});

test('shrinking, growing, closing and reopening preserve chat, subject and engine work and prior inert state',async({browser})=>{
  test.setTimeout(120000);
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await prepareWork(page);const before=await work(page),stored=await storage(page);
    // A background element already inert before opening must keep that state.
    await page.locator('main').evaluate(element=>element.inert=true);
    for(const screen of [{width:430,height:280},{width:844,height:320},{width:320,height:320}]){
      await resize(page,screen.width,screen.height);await mode(page,true);
      await page.locator('#chat-preview-input').focus();await expect(page.locator('#chat-preview-input')).toBeFocused();
      expect(await work(page)).toEqual(before);expect(await storage(page)).toEqual(stored);
      await resize(page,screen.width,900);await mode(page,false);
      expect(await page.locator('main').evaluate(element=>element.inert)).toBe(true);
      expect(await work(page)).toEqual(before);expect(await storage(page)).toEqual(stored);
      await resize(page,screen.width,screen.height);await mode(page,true);
      await activate(page,'#chat-preview-close');await expect(page.locator('#chat-preview-panel')).toBeHidden();
      await mode(page,false);await expect(page.locator('#chat-preview-toggle')).toBeFocused();
      expect(await page.locator('main').evaluate(element=>element.inert)).toBe(true);
      await page.keyboard.press('Enter');await mode(page,true);await expect(page.locator('#chat-preview-input')).toBeFocused();
      expect(await work(page)).toEqual(before);expect(await storage(page)).toEqual(stored);
      observations.push({screen,preserved:true,geometry:await panelGeometry(page)});
      await resize(page,screen.width,900);await mode(page,false);
    }
    await page.locator('main').evaluate(element=>element.inert=false);
    await activate(page,'#chat-preview-close');await mode(page,false);
    expect(await page.locator('main').evaluate(element=>element.inert)).toBe(false);
    expect(await work(page)).toEqual(before);expect(await storage(page)).toEqual(stored);
    expect(JSON.stringify(stored)).not.toContain(privateDraft);expect(JSON.stringify(stored)).not.toContain(privateMemory);
    await checked.verify();
  }finally{try{await evidence('short-screen-work-preservation',observations);}finally{await checked.context.close();}}
});

test('native clear choices retain their own focus while resizing and affect only the confirmed chat',async({browser})=>{
  test.setTimeout(120000);
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await prepareWork(page);const before=await work(page),stored=await storage(page);
    await resize(page,430,280);await mode(page,true);await activate(page,'#chat-preview-clear');
    await expect(page.locator('#chat-preview-clear-dialog')).toBeVisible();
    await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
    await page.keyboard.press('Tab');await focusedControl(page,'#chat-preview-clear-confirm');
    await page.keyboard.press('Shift+Tab');await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
    await observeClearClose(page);await page.keyboard.press('Escape');
    const cancelled=await page.evaluate(()=>window.__rioShortClearClosed);
    expect(cancelled).toEqual({open:false,trusted:true,focus:'chat-preview-clear',returnValue:'cancel'});
    await mode(page,true);await expect(page.locator('#chat-preview-panel')).toBeVisible();
    expect(await work(page)).toEqual(before);expect(await storage(page)).toEqual(stored);
    await activate(page,'#chat-preview-clear');await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
    await resize(page,430,900);await mode(page,false);
    await expect(page.locator('#chat-preview-clear-dialog')).toBeVisible();
    await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
    await resize(page,430,280);await mode(page,true);
    await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
    await page.keyboard.press('Tab');await focusedControl(page,'#chat-preview-clear-confirm');
    await observeClearClose(page);await page.keyboard.press('Enter');
    const confirmed=await page.evaluate(()=>window.__rioShortClearClosed);
    expect(confirmed).toEqual({open:false,trusted:true,focus:'chat-preview-input',returnValue:'confirm'});
    await mode(page,true);await expect(page.locator('#chat-preview-input')).toBeFocused();
    const after=await work(page);
    expect(after.draft).toBe('');expect(after.history).not.toContain(privateHistory);
    await expect(page.locator('#chat-preview-messages > li')).toHaveCount(1);
    await expect(page.locator('#chat-preview-subject')).toBeHidden();
    expect(after.engine).toEqual(before.engine);expect(await storage(page)).toEqual(stored);
    await page.keyboard.press('Escape');await expect(page.locator('#chat-preview-panel')).toBeHidden();
    await mode(page,false);await expect(page.locator('#chat-preview-toggle')).toBeFocused();
    expect(await page.locator('main').evaluate(element=>element.inert)).toBe(false);
    observations.push({cancelled,confirmed,enginePreserved:true,chatCleared:true});
    await checked.verify();
  }finally{try{await evidence('short-screen-native-clear',observations);}finally{await checked.context.close();}}
});

test('ordinary landscape chat remains nonmodal with keyboard access to the surrounding navigation',async({browser})=>{
  test.setTimeout(120000);
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await page.goto(fixture.origin+'/');
    for(const lang of languages){
      await resize(page,844,900,16);await language(page,lang);
      await activate(page,'#chat-preview-toggle');await page.locator('#chat-preview-input').fill(privateDraft);
      const stored=await storage(page);await resize(page,844,390,16);await mode(page,false);
      expect(await page.locator('main').evaluate(element=>element.inert)).toBe(false);
      await page.locator('#chat-preview-size').focus();await page.keyboard.press('Shift+Tab');
      const toggle=await focusedControl(page,'#chat-preview-toggle');
      await page.keyboard.press('Tab');await expect(page.locator('#chat-preview-size')).toBeFocused();
      await page.keyboard.press('Tab');const close=await focusedControl(page,'#chat-preview-close');
      await page.locator('#chat-preview-input').focus();await page.keyboard.press('Tab');
      const send=await focusedControl(page,'#chat-preview-send');
      await expect(page.locator('#chat-preview-input')).toHaveValue(privateDraft);
      expect(await storage(page)).toEqual(stored);
      observations.push({language:lang,geometry:await panelGeometry(page),keyboard:{toggle,close,send}});
      await activate(page,'#chat-preview-close');await mode(page,false);
      await expect(page.locator('#chat-preview-toggle')).toBeFocused();
    }
    await checked.verify();
  }finally{try{await evidence('ordinary-landscape-nonmodal',observations);}finally{await checked.context.close();}}
});
