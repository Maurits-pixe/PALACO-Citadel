import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','en','de','fr','es','ar','zh'];
const privateMarker='TST-share-private-context';
let fixture,surface,source;
test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['app.js','index.html','styles.css'])source[file+'Sha256']=createHash('sha256')
    .update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function checkedContext(browser,{clipboard='resolve',share='absent',canShare='absent',...options}={}){
  const context=await browser.newContext({...surface,locale:'nl-NL',...options}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin?route.continue():route.abort('blockedbyclient');
  });
  // Every test replaces the browser APIs before application code starts. No
  // real clipboard or operating-system share sheet is ever read or invoked.
  await context.addInitScript(({clipboard,share,canShare})=>{
    const calls={clipboard:[],share:[],canShare:[]},pending=[];
    const complete=(kind,mode,value)=>{
      calls[kind].push(typeof value==='object'?structuredClone(value):value);
      if(mode==='deferred')return new Promise((resolve,reject)=>pending.push({kind,resolve,reject}));
      if(mode==='denied')return Promise.reject(new DOMException('Synthetic permission denial','NotAllowedError'));
      if(mode==='cancel')return Promise.reject(new DOMException('Synthetic cancellation','AbortError'));
      if(mode==='reject')return Promise.reject(new Error('Synthetic unavailable share'));
      return Promise.resolve();
    };
    Object.defineProperty(navigator,'clipboard',{configurable:true,
      value:clipboard==='absent'?undefined:{writeText:value=>complete('clipboard',clipboard,value)}});
    Object.defineProperty(navigator,'share',{configurable:true,
      value:share==='absent'?undefined:value=>complete('share',share,value)});
    Object.defineProperty(navigator,'canShare',{configurable:true,
      value:canShare==='absent'?undefined:value=>{calls.canShare.push(structuredClone(value));return canShare==='yes';}});
    window.__rioShareTest={calls,finish(kind,outcome){
      const index=pending.findIndex(item=>item.kind===kind);
      if(index<0)throw Error('No pending synthetic '+kind+' operation');
      const item=pending.splice(index,1)[0];
      if(outcome==='resolve')item.resolve();else item.reject(new Error('Synthetic late result'));
    }};
  },{clipboard,share,canShare});
  return {context,async verify(){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null
      ||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    for(const request of requests)expect(decodeURIComponent(request.url)).not.toContain(privateMarker);
    expect(await context.cookies()).toEqual([]);expect(context.pages()).toHaveLength(1);
  }};
}
async function evidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-share-preview/1',project:test.info().project.name,
    observedAtUtc:new Date().toISOString(),source,observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}
async function open(page){
  await activate(page,'#share-btn');
  await expect(page.locator('#share-dialog')).toBeVisible();
  await expect(page.locator('#share-status')).toHaveAttribute('data-state','idle');
  await expect(page.locator('#share-link')).toBeFocused();
  const selected=await page.locator('#share-link').evaluate(input=>({value:input.value,start:input.selectionStart,end:input.selectionEnd}));
  expect(selected).toEqual({value:fixture.origin+'/',start:0,end:(fixture.origin+'/').length});
}
async function calls(page){return page.evaluate(()=>structuredClone(window.__rioShareTest.calls));}
async function work(page){return page.evaluate(()=>({
  memory:document.querySelector('#memory-input').value,question:document.querySelector('#question-input').value,
  consent:document.querySelector('#memory-consent').checked,dossier:document.querySelector('#dossier-output').outerHTML,
  answer:document.querySelector('#engine-answer').outerHTML,
  chatDraft:document.querySelector('#chat-preview-input').value,
  history:document.querySelector('#chat-preview-messages').innerHTML,
  local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))
}));}
async function closeSynchronously(page){
  const result=await page.evaluate(()=>{
    document.querySelector('#share-close').click();
    return {open:document.querySelector('#share-dialog').open,focus:document.activeElement.id};
  });
  expect(result).toEqual({open:false,focus:'share-btn'});
  await expect(page.locator('#share-dialog')).not.toBeVisible();
  return result;
}

test('sharing is an explicit canonical-link choice that preserves private drafts and conversation',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    await page.locator('#memory-input').fill(privateMarker+' memory');
    await page.locator('#memory-consent').check();
    await activate(page,'#memory-form button[type="submit"]');
    await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
    await page.locator('#question-input').fill(privateMarker+' question');
    await activate(page,'#chat-preview-toggle');
    await page.locator('#chat-preview-input').fill(privateMarker+' message');
    await activate(page,'#chat-preview-send');
    await page.locator('#chat-preview-input').fill(privateMarker+' chat draft');
    const before=await work(page);
    // Change the visible address without sending a private query to the
    // server. Neither its fields nor its hash may enter either share API.
    await page.evaluate(marker=>history.replaceState(null,'','/?email='+marker+'%40example.invalid#'+marker),privateMarker);
    const address=page.url();
    await expect(page.locator('#share-btn')).toHaveAttribute('aria-haspopup','dialog');
    await expect(page.locator('#share-btn')).toHaveAttribute('aria-controls','share-dialog');
    expect(await calls(page)).toEqual({clipboard:[],share:[],canShare:[]});
    await open(page);
    await expect(page.locator('#share-dialog')).toHaveAttribute('aria-labelledby','share-title');
    await expect(page.locator('#share-dialog')).toHaveAttribute('aria-describedby','share-boundary');
    await expect(page.locator('#share-link')).toHaveAttribute('readonly','');
    await expect(page.locator('#share-link')).toHaveAccessibleName(/\S/);
    await expect(page.locator('#share-status')).toHaveAttribute('aria-live','polite');
    await expect(page.locator('#share-native')).not.toBeVisible();
    expect((await calls(page)).clipboard).toEqual([]);
    await activate(page,'#share-copy');
    await expect(page.locator('#share-status')).toHaveAttribute('data-state','copied');
    expect(await calls(page)).toEqual({clipboard:[fixture.origin+'/'],share:[],canShare:[]});
    const closed=await closeSynchronously(page);
    expect(page.url()).toBe(address);expect(await work(page)).toEqual(before);
    await open(page);await page.keyboard.press('Escape');
    await expect(page.locator('#share-dialog')).not.toBeVisible();
    await expect(page.locator('#share-btn')).toBeFocused();
    expect(await work(page)).toEqual(before);
    await checked.verify();await evidence('canonical-choice',{address,sharedUrl:fixture.origin+'/',closed,preserved:true,calls:await calls(page)});
  }finally{await checked.context.close();}
});

test('the native share choice follows browser capabilities without silently invoking either API',async({browser})=>{
  const observations=[];
  for(const capability of [
    {share:'absent',canShare:'absent',visible:false},
    {share:'resolve',canShare:'absent',visible:true},
    {share:'resolve',canShare:'yes',visible:true},
    {share:'resolve',canShare:'no',visible:false},
  ]){
    const checked=await checkedContext(browser,capability),page=await checked.context.newPage();
    try{
      await page.goto(fixture.origin+'/');await open(page);
      const control=page.locator('#share-native');
      if(capability.visible)await expect(control).toBeVisible();else await expect(control).not.toBeVisible();
      await expect(page.locator('#share-copy')).toBeEnabled();
      const observed=await calls(page);
      expect(observed.clipboard).toEqual([]);expect(observed.share).toEqual([]);
      for(const value of observed.canShare)expect(value.url).toBe(fixture.origin+'/');
      if(capability.share!=='absent'&&capability.canShare!=='absent')expect(observed.canShare.length).toBeGreaterThan(0);
      await closeSynchronously(page);await checked.verify();observations.push({capability,calls:observed});
    }finally{await checked.context.close();}
  }
  await evidence('native-capabilities',observations);
});

test('missing or denied clipboard access offers a selected manual link without claiming a copy',async({browser})=>{
  const observations=[];
  for(const clipboard of ['absent','denied']){
    const checked=await checkedContext(browser,{clipboard}),page=await checked.context.newPage();
    try{
      await page.goto(fixture.origin+'/');await open(page);await activate(page,'#share-copy');
      await expect(page.locator('#share-status')).toHaveAttribute('data-state','manual');
      await expect(page.locator('#share-status')).not.toHaveText('');
      await expect(page.locator('#share-link')).toBeFocused();
      expect(await page.locator('#share-link').evaluate(input=>[input.selectionStart,input.selectionEnd]))
        .toEqual([0,(fixture.origin+'/').length]);
      await expect(page.locator('#share-copy')).toBeEnabled();await expect(page.locator('#share-close')).toBeEnabled();
      const observed=await calls(page);expect(observed.share).toEqual([]);
      expect(observed.clipboard).toEqual(clipboard==='absent'?[]:[fixture.origin+'/']);
      await checked.verify();observations.push({clipboard,state:'manual',calls:observed});
    }finally{await checked.context.close();}
  }
  await evidence('manual-copy-fallback',observations);
});

test('native success cancellation and failure have distinct outcomes without an automatic clipboard fallback',async({browser})=>{
  const observations=[];
  for(const [share,state]of [['resolve','shared'],['cancel','cancelled'],['reject','unavailable']]){
    const checked=await checkedContext(browser,{share,canShare:'yes'}),page=await checked.context.newPage();
    try{
      await page.goto(fixture.origin+'/');
      await page.evaluate(marker=>history.replaceState(null,'','/?person='+marker+'#'+marker),privateMarker);
      await open(page);await activate(page,'#share-native');
      await expect(page.locator('#share-status')).toHaveAttribute('data-state',state);
      await expect(page.locator('#share-status')).not.toHaveText('');
      await expect(page.locator('#share-copy')).toBeEnabled();await expect(page.locator('#share-native')).toBeEnabled();
      const observed=await calls(page);expect(observed.clipboard).toEqual([]);expect(observed.share).toHaveLength(1);
      const payload=observed.share[0];expect(payload.url).toBe(fixture.origin+'/');
      expect(Object.keys(payload).every(key=>['title','text','url'].includes(key))).toBe(true);
      expect(JSON.stringify(payload)).not.toContain(privateMarker);
      const status=await page.locator('#share-status').innerText();
      if(state==='shared')expect(status).not.toMatch(/afgeleverd|ontvangen|delivered|recipient received/i);
      await checked.verify();observations.push({share,state,payload,status});
    }finally{await checked.context.close();}
  }
  await evidence('native-results',observations);
});

test('closing invalidates pending work and language changes cannot revive a stale result or steal focus',async({browser})=>{
  const observations=[];
  for(const [kind,outcome,reopen]of [['clipboard','resolve',false],['clipboard','reject',true],['share','resolve',true],['share','reject',false]]){
    const checked=await checkedContext(browser,{clipboard:'deferred',share:'deferred',canShare:'yes'}),page=await checked.context.newPage();
    try{
      await page.goto(fixture.origin+'/');await open(page);
      await activate(page,kind==='clipboard'?'#share-copy':'#share-native');
      await expect(page.locator('#share-status')).toHaveAttribute('data-state',kind==='clipboard'?'copying':'sharing');
      await expect(page.locator('#share-copy')).toBeDisabled();await expect(page.locator('#share-native')).toBeDisabled();
      await expect(page.locator('#share-close')).toBeEnabled();
      await page.evaluate(()=>{
        document.querySelector('#share-copy').click();document.querySelector('#share-native').click();
        document.querySelector('#share-copy').click();document.querySelector('#share-native').click();
      });
      const busyCalls=await calls(page);
      expect(busyCalls.clipboard).toHaveLength(kind==='clipboard'?1:0);expect(busyCalls.share).toHaveLength(kind==='share'?1:0);
      const dutch=await page.locator('#share-status').textContent();
      // Exercise the same public language action while the operation is
      // pending. No API is retried and the current status must retranslate.
      await page.locator('.lang-btn[data-lang="en"]').evaluate(button=>button.click());
      await expect(page.locator('html')).toHaveAttribute('lang','en');
      await expect(page.locator('#share-status')).not.toHaveText(dutch);
      const english=await page.locator('#share-status').textContent();
      const closed=await closeSynchronously(page);
      await activate(page,'.lang-btn[data-lang="ar"]');
      if(reopen){
        await open(page);await activate(page,'#share-copy');
        await expect(page.locator('#share-status')).toHaveAttribute('data-state','copying');
        // Place focus on an enabled control. Chromium may asynchronously
        // remove focus from the copy button once it becomes disabled.
        await page.locator('#share-link').focus();
      }else await page.locator('#memory-input').focus();
      const before=await page.evaluate(()=>({status:document.querySelector('#share-status').outerHTML,
        open:document.querySelector('#share-dialog').open,focus:document.activeElement.id}));
      await page.evaluate(({kind,outcome})=>window.__rioShareTest.finish(kind,outcome),{kind,outcome});
      // Flush both the promise continuation and a later task in the page,
      // without relying on a fixed delay or any real network operation.
      await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
      const after=await page.evaluate(()=>({status:document.querySelector('#share-status').outerHTML,
        open:document.querySelector('#share-dialog').open,focus:document.activeElement.id}));
      expect(after).toEqual(before);
      if(reopen){
        await expect(page.locator('#share-copy')).toBeDisabled();await expect(page.locator('#share-native')).toBeDisabled();
        await page.evaluate(()=>window.__rioShareTest.finish('clipboard','resolve'));
        await expect(page.locator('#share-status')).toHaveAttribute('data-state','copied');
        await expect(page.locator('#share-copy')).toBeEnabled();await expect(page.locator('#share-native')).toBeEnabled();
      }
      const observed=await calls(page);
      expect(observed.clipboard).toHaveLength((kind==='clipboard'?1:0)+(reopen?1:0));expect(observed.share).toHaveLength(kind==='share'?1:0);
      await checked.verify();observations.push({kind,outcome,reopen,dutch,english,closed,before,after,calls:observed});
    }finally{await checked.context.close();}
  }
  await evidence('pending-close-language',observations);
});

test('seven translated choices fit 320 pixels at doubled text with RTL and native modal keyboard containment',async({browser})=>{
  const checked=await checkedContext(browser,{viewport:{width:320,height:844},clipboard:'absent',share:'resolve',canShare:'yes'});
  const page=await checked.context.newPage(),observations=[],titles=new Set(),boundaries=new Set(),manual=new Set();
  try{
    await page.goto(fixture.origin+'/');
    await page.evaluate(()=>{document.documentElement.style.fontSize='32px';document.body.style.fontSize='32px';});
    expect(await page.evaluate(()=>getComputedStyle(document.body).fontSize)).toBe('32px');
    for(const language of languages){
      await activate(page,'.lang-btn[data-lang="'+language+'"]');await open(page);
      await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
      await expect(page.locator('#share-link')).toHaveAttribute('dir','ltr');
      const title=(await page.locator('#share-title').innerText()).trim(),boundary=(await page.locator('#share-boundary').innerText()).trim();
      expect(title).not.toBe('');expect(boundary).not.toBe('');titles.add(title);boundaries.add(boundary);
      expect(title+boundary).not.toMatch(/undefined|\[object Object\]/);
      const geometry=await page.locator('#share-dialog').evaluate(dialog=>{
        const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,
          scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};};
        return {viewport:innerWidth,dialog:box(dialog),controls:[...dialog.querySelectorAll('input,button')].filter(item=>!item.hidden).map(item=>({id:item.id,...box(item)}))};
      });
      expect(geometry.dialog.left).toBeGreaterThanOrEqual(-1);expect(geometry.dialog.right).toBeLessThanOrEqual(321);
      expect(geometry.dialog.scrollWidth).toBeLessThanOrEqual(geometry.dialog.clientWidth+1);
      for(const control of geometry.controls){
        expect(control.left).toBeGreaterThanOrEqual(geometry.dialog.left-1);
        expect(control.right).toBeLessThanOrEqual(geometry.dialog.right+1);
        expect(control.width).toBeGreaterThanOrEqual(44);expect(control.height).toBeGreaterThanOrEqual(44);
        // The readonly URL intentionally remains one selectable line. Its
        // native input scrolls horizontally rather than widening the sheet.
        if(control.id!=='share-link')expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth+1);
      }
      const focus=[];
      for(let index=0;index<7;index++){
        await page.keyboard.press(index>=5?'Shift+Tab':'Tab');
        const current=await page.evaluate(()=>({id:document.activeElement.id,tag:document.activeElement.tagName,
          documentFocused:document.hasFocus(),contained:document.querySelector('#share-dialog').contains(document.activeElement)}));
        // Native Chromium may let Tab leave the document for browser chrome;
        // this is allowed. A focused background element in the document is
        // not. The following Tab must return to the dialog.
        expect(current.contained||(current.tag==='BODY'&&!current.documentFocused),JSON.stringify({index,current,focus})).toBe(true);
        focus.push(current);
      }
      expect(focus.slice(0,3).map(item=>item.id)).toEqual(['share-copy','share-native','share-close']);
      expect(focus[4].contained).toBe(true);expect(['share-dialog','share-link']).toContain(focus[4].id);
      expect(focus.at(-1).id).toBe('share-close');
      await activate(page,'#share-copy');await expect(page.locator('#share-status')).toHaveAttribute('data-state','manual');
      manual.add((await page.locator('#share-status').innerText()).trim());
      await page.keyboard.press('Escape');await expect(page.locator('#share-dialog')).not.toBeVisible();
      await expect(page.locator('#share-btn')).toBeFocused();
      observations.push({language,title,boundary,geometry,focus});
    }
    expect(titles.size).toBe(7);expect(boundaries.size).toBe(7);expect(manual.size).toBe(7);
    expect((await calls(page)).clipboard).toEqual([]);expect((await calls(page)).share).toEqual([]);
    await checked.verify();await evidence('translated-large-text-keyboard',observations);
  }finally{await checked.context.close();}
});
