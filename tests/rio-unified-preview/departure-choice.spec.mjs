import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','en','de','fr','es','pt','ru','eo','pl','ar','zh'];
const links=['#rio-unified-reception','#rio-unified-offline',
  '.taskbar a[href="https://palaco.mauritsvang1.chatgpt.site/"]',
  '.taskbar a[href="https://citadel.mauritsvang1.chatgpt.site/"]',
  '.taskbar a[href="https://palaco.mauritsvang1.chatgpt.site/account.html"]'];
let fixture,surface;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  // Exercise the actual portable review server, including its strict query
  // boundary, rather than a more permissive browser fixture.
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function checkedContext(browser,options={}){
  const context=await browser.newContext({...surface,locale:'en-US',...options});
  const errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',async request=>requests.push({
    url:request.url(),method:request.method(),headers:await request.allHeaders(),
  }));
  // Public destinations are represented by inert local responses. No test
  // contacts PALACO, Citadel, an account service, or a real provider.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(!/^https?:$/.test(url.protocol)||url.origin===fixture.origin)return route.continue();
    return route.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{
      'Content-Security-Policy':"default-src 'none'; img-src data:; base-uri 'none'; form-action 'none'",
      'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    },body:'<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Intercepted public destination</title></head><body><h1>Local test response</h1></body></html>'});
  });
  return {context,requests,async verify(){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET')).toEqual([]);
    expect(requests.filter(request=>new URL(request.url).pathname.startsWith('/api/'))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  }};
}

async function activate(page,locator){
  await locator.focus();
  await page.keyboard.press('Enter');
}
async function openChat(page,value){
  await page.locator('#chat-preview-toggle').click();
  await page.locator('#chat-preview-input').fill(value);
}
async function clearChat(page){
  await page.locator('#chat-preview-clear').click();
  await page.locator('#chat-preview-clear-confirm').click();
  // Native close-event work must be visible before another interaction can
  // claim to follow clearing. This also observes its final focus restoration.
  await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(0);
  await expect(page.locator('#chat-preview-input')).toHaveValue('');
  await expect(page.locator('#chat-preview-input')).toBeFocused();
  await expect(page.locator('#chat-preview-subject')).not.toBeVisible();
}
async function chooseDeparture(page,selector='#rio-unified-reception'){
  const trigger=page.locator(selector);
  await activate(page,trigger);
  const dialog=page.locator('#rio-departure-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-labelledby','rio-departure-title');
  await expect(dialog).toHaveAttribute('aria-describedby','rio-departure-warning');
  await expect(page.locator('#rio-departure-stay')).toBeFocused();
  return {dialog,trigger};
}
async function storage(page){
  return page.evaluate(()=>({
    local:Object.fromEntries(Object.entries(localStorage)),
    session:Object.fromEntries(Object.entries(sessionStorage)),
  }));
}

test('fresh, welcome-only, whitespace-only and explicitly cleared chats retain ordinary navigation',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    for(const state of ['fresh','welcome','whitespace','cleared','consent-only']){
      await page.goto(fixture.origin+'/');
      if(state!=='fresh'){
        await openChat(page,state==='cleared'?'TST-cleared-message':state==='whitespace'?'   \n\t':'');
        if(state==='cleared'){
          await page.locator('#chat-preview-send').click();
          await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(1);
          await clearChat(page);
        }
        await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(0);
      }
      if(state==='consent-only')await page.locator('#memory-consent').check();
      if(state==='whitespace')await page.locator('#memory-input').fill('   ');
      const link=page.locator('#rio-unified-reception'),href=await link.getAttribute('href');
      await activate(page,link);
      await expect(page).toHaveURL(new URL(href,fixture.origin).href);
      await expect(page.locator('#nova-explained')).toBeFocused();
    }
    await checked.verify();
  }finally{await checked.context.close();}
});

test('cancel, Escape and backdrop preserve a draft and return focus without closing its chat',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    const draft='TST-private draft stays in this page';
    await openChat(page,draft);
    const before=await storage(page),original=page.url();
    const dismiss=async(action,dialog)=>{
      if(action==='cancel')await page.locator('#rio-departure-stay').click();
      else if(action==='escape')await page.keyboard.press('Escape');
      else{
        const bounds=await dialog.boundingBox();expect(bounds.y).toBeGreaterThan(2);
        await page.mouse.click(2,2);
      }
    };
    for(const action of ['cancel','escape','backdrop'])await test.step('ordinary '+action,async()=>{
      const {dialog,trigger}=await chooseDeparture(page);
      await page.evaluate(()=>{
        window.__rioOrdinaryDepartureClosed=new Promise(done=>document.querySelector('#rio-departure-dialog')
          .addEventListener('close',()=>done(true),{once:true}));
      });
      await dismiss(action,dialog);
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expect(page.locator('#chat-preview-panel')).toBeVisible();
      await expect(page.locator('#chat-preview-toggle')).toHaveAttribute('aria-expanded','true');
      await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
      expect(page.url()).toBe(original);
      expect(await storage(page)).toEqual(before);
      // Finish this independent real close before arming a new close observer.
      // The focus/content assertions above still observe the ordinary action.
      await page.evaluate(()=>window.__rioOrdinaryDepartureClosed);
    });
    const reopened=[];
    for(const action of ['cancel','escape','backdrop'])await test.step('reopen during native '+action+' close',async()=>{
      const {dialog}=await chooseDeparture(page),next=page.locator('#rio-unified-offline');
      const expected={href:fixture.origin+'/rio/?lang='+await page.locator('html').getAttribute('lang'),
        name:(await next.innerText()).trim(),origin:fixture.origin};
      await page.evaluate(()=>{
        const dialog=document.querySelector('#rio-departure-dialog'),next=document.querySelector('#rio-unified-offline');
        let wasClosed;
        window.__rioReopenedDeparture=new Promise(done=>{
          // Real UA close, with the next public route selected in capture.
          // The old application close-handler then runs against the reopened
          // dialog; it must not erase this newer choice or move its focus.
          dialog.addEventListener('close',()=>{
            wasClosed=!dialog.open;
            next.focus({preventScroll:true});next.click();
          },{capture:true,once:true});
          dialog.addEventListener('close',()=>done({wasClosed,open:dialog.open,
            href:document.querySelector('#rio-departure-new-tab').getAttribute('href'),
            name:document.querySelector('#rio-departure-name').textContent,
            origin:document.querySelector('#rio-departure-origin').textContent,
            focused:document.activeElement.id}),{once:true});
        });
      });
      await dismiss(action,dialog);
      const observed=await page.evaluate(()=>window.__rioReopenedDeparture);
      reopened.push({action,expected,observed});
      expect(observed).toEqual({wasClosed:true,open:true,...expected,focused:'rio-departure-stay'});
      await expect(dialog).toBeVisible();await expect(page.locator('#rio-departure-stay')).toBeFocused();
      await expect(page.locator('#rio-departure-new-tab')).toHaveAttribute('href',expected.href);
      await page.evaluate(()=>{
        window.__rioReopenedChoiceClosed=new Promise(done=>document.querySelector('#rio-departure-dialog')
          .addEventListener('close',()=>done(true),{once:true}));
      });
      const popupPromise=checked.context.waitForEvent('page');
      await activate(page,page.locator('#rio-departure-new-tab'));
      const popup=await popupPromise;await popup.waitForLoadState('load');
      await expect(popup).toHaveURL(expected.href);
      expect(await popup.evaluate(()=>({opener:window.opener===null,referrer:document.referrer}))).toEqual({opener:true,referrer:''});
      expect(await popup.locator('body').innerText()).not.toContain(draft);
      expect(JSON.stringify(await storage(popup))).not.toContain(draft);
      const navigation=checked.requests.filter(request=>request.url===expected.href).at(-1);
      expect(navigation).toBeTruthy();
      expect(navigation.headers.referer).toBeUndefined();expect(navigation.headers.cookie).toBeUndefined();
      expect(navigation.headers.authorization).toBeUndefined();
      await popup.close();await page.bringToFront();
      await page.evaluate(()=>window.__rioReopenedChoiceClosed);
      await expect(dialog).not.toBeVisible();await expect(next).toBeFocused();
      await expect(page.locator('#chat-preview-panel')).toBeVisible();
      await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
      expect(page.url()).toBe(original);expect(await storage(page)).toEqual(before);
      expect(JSON.stringify(checked.requests)).not.toContain(draft);
    });
    const evidence={schema:'rio-departure-reopen/1',project:test.info().project.name,
      sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim(),
      sourceIntegrationSha256:createHash('sha256').update(await readFile(resolve(repository,'render-dist/integration.mjs'))).digest('hex'),
      reopened};
    const path=test.info().outputPath('departure-reopen-state.json');
    await writeFile(path,JSON.stringify(evidence,null,2)+'\n');
    await test.info().attach('departure-reopen-state',{path,contentType:'application/json'});
    await checked.verify();
  }finally{await checked.context.close();}
});

test('selected subjects and sent visitor messages count as temporary work until the chat is cleared',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    await page.locator('[data-subject="symbol"]').click();
    await page.locator('#subject-continue').click();
    await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(0);
    await chooseDeparture(page);
    await page.locator('#rio-departure-stay').click();
    await expect(page.locator('#chat-preview-subject')).toBeVisible();
    await page.locator('#chat-preview-subject summary').click();
    await page.locator('#chat-preview-subject-clear').click();
    await page.locator('#chat-preview-input').fill('TST-visitor message');
    await page.locator('#chat-preview-send').click();
    await expect(page.locator('#chat-preview-input')).toHaveValue('');
    await chooseDeparture(page,'#rio-unified-offline');
    await page.keyboard.press('Escape');
    await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(1);
    await clearChat(page);
    await activate(page,page.locator('#rio-unified-offline'));
    await expect(page).toHaveURL(fixture.origin+'/rio/');
    await checked.verify();
  }finally{await checked.context.close();}
});

test('Engine memory drafts and consented dossiers are protected independently of chat',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    const memory='TST-private appointment is Tuesday at ten';
    await page.locator('#memory-input').fill(memory);
    await chooseDeparture(page);
    await page.locator('#rio-departure-stay').click();
    await expect(page.locator('#memory-input')).toHaveValue(memory);
    await expect(page.locator('#memory-consent')).not.toBeChecked();
    await page.locator('#memory-consent').check();
    await page.locator('#memory-form button[type="submit"]').click();
    await expect(page.locator('#memory-input')).toHaveValue('');
    await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
    await chooseDeparture(page);
    await page.keyboard.press('Escape');
    const question='When is the TST-private appointment?';
    await page.locator('#question-input').fill(question);
    await openChat(page,'TST-chat cleared independently');
    await clearChat(page);
    await chooseDeparture(page);
    await page.locator('#rio-departure-stay').click();
    await expect(page.locator('#question-input')).toHaveValue(question);
    await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
    const saved=JSON.stringify(await storage(page));
    expect(saved).not.toContain(memory);expect(saved).not.toContain(question);
    await checked.verify();
  }finally{await checked.context.close();}
});

// Use full Chromium's new headless mode for native tab/foreground gestures.
// https://playwright.dev/docs/browsers#chromium-new-headless-mode
// A dedicated test-scoped fixture leaves the other cases on the default shell.
const nativeGestureTest=test.extend({
  nativeBrowser:async({playwright},use)=>{
    const browser=await playwright.chromium.launch({channel:'chromium'});
    try{await use(browser);}finally{await browser.close();}
  },
});

test.describe('native browser gestures',()=>{
nativeGestureTest('same-document, native new-tab, download and modified navigation retain their browser behavior',async({nativeBrowser:browser})=>{
  // Browser gestures own different tab/download lifecycles. Isolate each one
  // and report its step rather than letting pending work mask a later failure.
  for(const kind of ['fragment','new-tab','modified','download'])await test.step(kind,async()=>{
    const checked=await test.step('create the isolated gesture profile',()=>checkedContext(browser));
    let primaryError;
    try{
      const page=await test.step('create the source page',()=>checked.context.newPage());
      await test.step('load the source page',()=>page.goto(fixture.origin+'/'));
      const draft='TST-native navigation draft';
      await test.step('keep a temporary chat draft',()=>openChat(page,draft));
      await test.step('close the chat view without clearing its draft',()=>page.locator('#chat-preview-close').click());
      if(kind==='fragment'){
        await activate(page,page.locator('.taskbar a[href="#top"]'));
      }else if(kind==='download'){
        const link=page.locator('#rio-unified-offline');
        await link.evaluate(element=>{element.href='/rio/download';element.download='RIO.html';});
        const downloaded=page.waitForEvent('download');
        await activate(page,link);
        const download=await downloaded;
        expect(download.suggestedFilename()).toBe('PALACO-RIO-v0.1.html');
        // Observe a completed file, not just the download-start event.
        expect(await download.failure()).toBeNull();
        expect(await readFile(await download.path())).toEqual(await readFile(resolve(repository,'render-dist/rio/download')));
      }else{
        const link=page.locator('#rio-unified-reception');
        if(kind==='new-tab')await test.step('set the native blank target',()=>link.evaluate(element=>element.target='_blank'));
        const destination=await test.step('read the existing reception destination',async()=>new URL(await link.getAttribute('href'),fixture.origin).href);
        await test.step('foreground the source before the browser gesture',()=>page.bringToFront());
        const popup=await test.step('perform the native gesture and observe its new page',async()=>{
          // Arm creation before clicking and observe both promises together so
          // a failed gesture cannot leave an unobserved page-wait rejection.
          const opened=checked.context.waitForEvent('page');
          const gesture=test.step(kind==='modified'?'Control-click the reception link':'activate the blank-target link',
            ()=>kind==='modified'?link.click({modifiers:['Control']}):activate(page,link));
          const [created]=await Promise.all([test.step('observe the browser-created page',()=>opened),gesture]);
          return created;
        });
        // A Control-click can create a background tab. Make that explicit
        // before waiting for its complete load, without changing the gesture.
        await test.step('foreground the newly opened page',()=>popup.bringToFront());
        await test.step('wait for the native destination to finish loading',()=>popup.waitForLoadState('load'));
        await test.step('verify the original destination URL',()=>expect(popup).toHaveURL(destination));
        await test.step('close the opened native page',()=>popup.close());
        await test.step('return to the preserved source page',()=>page.bringToFront());
      }
      await expect(page.locator('#rio-departure-dialog')).not.toBeVisible();
      await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
      expect(page.url()).toBe(fixture.origin+'/'+(kind==='fragment'?'#top':''));
      await checked.verify();
    }catch(error){primaryError=error;throw error;}
    finally{
      try{await test.step('close the isolated gesture context',()=>checked.context.close());}
      catch(cleanupError){
        // Timeout disposal may already have removed this context. Preserve the
        // operation that failed; cleanup must still fail an otherwise good test.
        if(!primaryError&&test.info().status!=='timedOut')throw cleanupError;
        const details=String(cleanupError.stack||cleanupError);
        try{await test.info().attach(kind+'-secondary-cleanup-error',{body:details,contentType:'text/plain'});}
        catch{console.warn('Secondary gesture cleanup failure: '+details);}
      }
    }
  });
});
});

test('each protected route opens a native isolated tab containing only its public destination and language',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    for(const selector of links){
      await page.goto(fixture.origin+'/');
      await page.locator('.lang-btn[data-lang="fr"]').click();
      const draft='TST-private-draft-never-transferred';
      await openChat(page,draft);
      const memory='TST-private-memory-never-transferred';
      await page.locator('#chat-preview-close').click();
      await page.locator('#memory-input').fill(memory);
      await page.locator('#chat-preview-toggle').click();
      const before=await storage(page),original=page.url();
      const {dialog,trigger}=await chooseDeparture(page,selector);
      const sourceHref=new URL(await trigger.getAttribute('href'),fixture.origin).href;
      const destinationNames={
        [links[2]]:'PALACO Hoofdkantoor',
        [links[3]]:'Citadel Consommateur',
        [links[4]]:'5CRIPTIE ID Compte personnel',
      };
      await expect(page.locator('#rio-departure-name')).toHaveText(
        destinationNames[selector]??(await trigger.textContent()).trim());
      const expected=selector==='#rio-unified-offline'?fixture.origin+'/rio/?lang=fr':sourceHref;
      const newTab=page.locator('#rio-departure-new-tab');
      await expect(newTab).toHaveAttribute('href',expected);
      await expect(newTab).toHaveAttribute('target','_blank');
      expect((await newTab.getAttribute('rel')).split(/\s+/).sort()).toEqual(['noopener','noreferrer']);
      const popupPromise=checked.context.waitForEvent('page');
      await activate(page,newTab);
      const popup=await popupPromise;await popup.waitForLoadState('load');
      await expect(popup).toHaveURL(expected);
      expect(await popup.evaluate(()=>({opener:window.opener===null,referrer:document.referrer}))).toEqual({opener:true,referrer:''});
      expect(await popup.locator('body').innerText()).not.toContain(draft);
      expect(await popup.locator('body').innerText()).not.toContain(memory);
      expect(JSON.stringify(await storage(popup))).not.toContain(draft);
      expect(JSON.stringify(await storage(popup))).not.toContain(memory);
      if(selector==='#rio-unified-offline')await expect(popup.locator('#language')).toHaveValue('fr');
      if(selector==='#rio-unified-reception')await expect(popup.locator('#nova-language')).toHaveValue('fr');
      const navigation=checked.requests.filter(request=>request.url===expected.split('#')[0]).at(-1);
      expect(navigation).toBeTruthy();
      expect(navigation.headers.referer).toBeUndefined();
      expect(navigation.headers.cookie).toBeUndefined();
      expect(navigation.headers.authorization).toBeUndefined();
      expect(JSON.stringify(checked.requests)).not.toContain(draft);
      expect(JSON.stringify(checked.requests)).not.toContain(memory);
      await popup.close();await page.bringToFront();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
      await expect(page.locator('#memory-input')).toHaveValue(memory);
      await expect(page.locator('#chat-preview-panel')).toBeVisible();
      expect(page.url()).toBe(original);
      expect(await storage(page)).toEqual(before);
      // The source route keeps its original ordinary-navigation href.
      expect(new URL(await trigger.getAttribute('href'),fixture.origin).href).toBe(sourceHref);
    }
    await checked.verify();
  }finally{await checked.context.close();}
});

test('eleven translated modal choices remain contained and keyboard reachable at 320 pixels with doubled text',async({browser})=>{
  const checked=await checkedContext(browser,{viewport:{width:320,height:844}}),page=await checked.context.newPage();
  try{
    const titles=new Set();
    for(const language of languages){
      await page.goto(fixture.origin+'/');
      await page.locator('.lang-btn[data-lang="'+language+'"]').click();
      await page.addStyleTag({content:'html, body { font-size: 32px !important; }'});
      await openChat(page,'TST-layout draft');
      const {dialog,trigger}=await chooseDeparture(page);
      const title=page.locator('#rio-departure-title');
      titles.add((await title.innerText()).trim());
      await expect(title).not.toHaveText('');
      await expect(page.locator('#rio-departure-warning')).not.toHaveText('');
      await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
      const metrics=await dialog.evaluate(element=>{
        const box=element.getBoundingClientRect();
        return {left:box.left,right:box.right,width:innerWidth,scroll:element.scrollWidth,client:element.clientWidth};
      });
      expect(metrics.left).toBeGreaterThanOrEqual(-1);
      expect(metrics.right).toBeLessThanOrEqual(metrics.width+1);
      expect(metrics.scroll).toBeLessThanOrEqual(metrics.client+1);
      for(const selector of ['#rio-departure-stay','#rio-departure-new-tab']){
        const control=page.locator(selector);
        const size=await control.evaluate(element=>{
          const box=element.getBoundingClientRect();
          return {width:box.width,height:box.height,scroll:element.scrollWidth,client:element.clientWidth};
        });
        expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44);
        expect(size.scroll).toBeLessThanOrEqual(size.client+1);
      }
      await page.keyboard.press('Tab');
      await expect(page.locator('#rio-departure-new-tab')).toBeFocused();
      // Native dialog navigation can include browser chrome after the last
      // control. Verify the reverse path without replacing its focus model.
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#rio-departure-stay')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
    }
    expect(titles.size).toBe(languages.length);
    await checked.verify();
  }finally{await checked.context.close();}
});
