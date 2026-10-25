import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','pl','ar','pt','ru','eo'];
const regimes=[
  {name:'320-normal',width:320,height:844,font:16,group:'narrow'},
  {name:'320-double',width:320,height:900,font:32,group:'narrow'},
  {name:'430-normal',width:430,height:844,font:16,group:'narrow'},
  {name:'430-double',width:430,height:900,font:32,group:'narrow'},
  {name:'640-normal',width:640,height:900,font:16,group:'wide'},
  {name:'640-double',width:640,height:900,font:32,group:'wide'},
  {name:'1440-normal',width:1440,height:900,font:16,group:'wide'},
  {name:'1440-double',width:1440,height:900,font:32,group:'wide'},
  {name:'landscape',width:844,height:390,font:16,group:'landscape'},
];
const privateDraft='TST-chat-dock-private-draft-survives-layout';
let fixture,surface,source;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim(),
    cssSha256:createHash('sha256').update(await readFile(resolve(repository,'render-dist/styles.css'))).digest('hex')};
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
    for(const request of requests)expect(decodeURIComponent(request.url)).not.toContain(privateDraft);
    expect(await context.cookies()).toEqual([]);expect(context.pages()).toHaveLength(1);
  }};
}
async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function storage(page){return page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
  session:Object.fromEntries(Object.entries(sessionStorage))}));}
async function resize(page,regime){
  const before=await storage(page);
  await page.setViewportSize({width:regime.width,height:regime.height});
  await page.evaluate(size=>{
    document.documentElement.style.fontSize=size+'px';document.body.style.fontSize=size+'px';
  },regime.font);
  expect(await storage(page)).toEqual(before);
}
async function selectLanguage(page,language){
  const before=await storage(page);
  await activate(page,'.lang-btn[data-lang="'+language+'"]');
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
  const expected={local:before.local,session:{...before.session,'palaco-language':language}};
  expect(await storage(page)).toEqual(expected);
  return expected;
}
async function geometry(page){
  return page.evaluate(()=>{
    const box=element=>{const r=element.getBoundingClientRect();return {
      left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const control=element=>{
      const r=box(element),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {...r,disabled:Boolean(element.disabled),hit:element.contains(hit),
        scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};
    };
    const panel=document.querySelector('#chat-preview-panel');
    return {viewport:{width:document.documentElement.clientWidth,height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth},
      nav:box(document.querySelector('.taskbar')),
      navigation:[...document.querySelectorAll('.taskbar-item')].map(control),
      toggle:control(document.querySelector('#chat-preview-toggle')),
      panel:panel.hidden?null:box(panel),expanded:panel.classList.contains('is-expanded')};
  });
}
function safeDock(g){
  const inside=box=>box.left>=-1&&box.right<=g.viewport.width+1&&box.top>=-1&&box.bottom<=g.viewport.height+1;
  return inside(g.nav)&&inside(g.toggle)&&g.toggle.hit&&g.toggle.bottom<=g.nav.top-8
    &&g.navigation.every(item=>inside(item)&&item.width>=44&&item.height>=44&&(item.disabled||item.hit))
    &&(!g.panel||(inside(g.panel)&&g.panel.top>=15&&g.panel.bottom<=g.toggle.top-8&&g.panel.height>0));
}
async function settledDock(page,label){
  let previous,last;
  await expect.poll(async()=>{
    last=await geometry(page);const current=JSON.stringify(last),stable=current===previous;previous=current;
    return stable&&safeDock(last);
  },{message:label+' keeps the navigation, chat toggle and panel separately reachable',
    timeout:5000,intervals:[16,32,64,128]}).toBe(true);
  return last;
}
function assertDock(g){
  expect(g.viewport.scrollWidth).toBeLessThanOrEqual(g.viewport.width+1);
  expect(g.toggle.width).toBeGreaterThanOrEqual(44);expect(g.toggle.height).toBeGreaterThanOrEqual(44);
  expect(g.toggle.scrollWidth).toBeLessThanOrEqual(g.toggle.clientWidth+1);
  expect(g.toggle.left).toBeGreaterThanOrEqual(15);expect(g.toggle.right).toBeLessThanOrEqual(g.viewport.width-15);
  expect(g.toggle.bottom).toBeLessThanOrEqual(g.nav.top-8);
  expect(g.toggle.hit).toBe(true);
  for(const item of g.navigation){
    expect(item.width).toBeGreaterThanOrEqual(44);expect(item.height).toBeGreaterThanOrEqual(44);
    if(!item.disabled)expect(item.hit).toBe(true);
  }
  if(g.panel){
    expect(g.panel.top).toBeGreaterThanOrEqual(15);
    expect(g.panel.left).toBeGreaterThanOrEqual(11);expect(g.panel.right).toBeLessThanOrEqual(g.viewport.width-11);
    expect(g.panel.bottom).toBeLessThanOrEqual(g.toggle.top-8);
  }
}
async function focusedControl(page,selector){
  await expect(page.locator(selector)).toBeFocused();
  const result=await page.locator(selector).evaluate(element=>{
    const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
      viewport:{width:document.documentElement.clientWidth,height:innerHeight},
      hit:element.contains(hit),focusVisible:element.matches(':focus-visible')};
  });
  expect(result.width).toBeGreaterThanOrEqual(44);expect(result.height).toBeGreaterThanOrEqual(44);
  expect(result.left).toBeGreaterThanOrEqual(-1);expect(result.right).toBeLessThanOrEqual(result.viewport.width+1);
  expect(result.top).toBeGreaterThanOrEqual(-1);expect(result.bottom).toBeLessThanOrEqual(result.viewport.height+1);
  expect(result.hit).toBe(true);expect(result.focusVisible).toBe(true);
  return result;
}
async function keyboardActions(page){
  await page.locator('#chat-preview-title').focus();
  await page.keyboard.press('Tab');await expect(page.locator('#chat-preview-size')).toBeFocused();
  await page.keyboard.press('Tab');const close=await focusedControl(page,'#chat-preview-close');
  await page.locator('#chat-preview-input').focus();await page.keyboard.press('Tab');
  const send=await focusedControl(page,'#chat-preview-send');
  return {close,send};
}
async function evidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-chat-dock-layout/1',project:test.info().project.name,
    source,observedAtUtc:new Date().toISOString(),observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}

test('closed chat and navigation remain separate at narrow, double-text and landscape sizes',async({browser})=>{
  test.setTimeout(120000);
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await page.goto(fixture.origin+'/');
    for(const regime of regimes){
      await resize(page,regime);
      for(const language of languages)await test.step(regime.name+' '+language,async()=>{
        const expectedStorage=await selectLanguage(page,language);
        await expect(page.locator('#chat-preview-panel')).not.toBeVisible();
        await page.locator('#chat-preview-toggle').focus();
        const measured=await settledDock(page,regime.name+' '+language);assertDock(measured);
        await focusedControl(page,'#chat-preview-toggle');
        expect(await storage(page)).toEqual(expectedStorage);
        observations.push({regime,language,geometry:measured});
      });
    }
    await checked.verify();
  }finally{try{await evidence('closed-chat-dock',observations);}finally{await checked.context.close();}}
});

for(const group of ['narrow','wide','landscape'])test(group+' compact and expanded chat preserve the dock, keyboard access and draft',async({browser})=>{
  test.setTimeout(120000);
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await page.goto(fixture.origin+'/');await activate(page,'#chat-preview-toggle');
    await page.locator('#chat-preview-input').fill(privateDraft);
    for(const regime of regimes.filter(item=>item.group===group)){
      await resize(page,regime);
      for(const language of languages)await test.step(regime.name+' '+language,async()=>{
        const expectedStorage=await selectLanguage(page,language);
        for(const mode of ['compact','expanded']){
          if(mode==='expanded')await activate(page,'#chat-preview-size');
          await expect(page.locator('#chat-preview-size')).toHaveAttribute('aria-pressed',String(mode==='expanded'));
          const measured=await settledDock(page,regime.name+' '+language+' '+mode);assertDock(measured);
          expect(measured.expanded).toBe(mode==='expanded');
          const keyboard=await keyboardActions(page);
          assertDock(await settledDock(page,regime.name+' '+language+' '+mode+' after keyboard navigation'));
          await expect(page.locator('#chat-preview-input')).toHaveValue(privateDraft);
          expect(await storage(page)).toEqual(expectedStorage);
          expect(JSON.stringify(expectedStorage)).not.toContain(privateDraft);
          observations.push({regime,language,mode,geometry:measured,keyboard});
        }
        await activate(page,'#chat-preview-size');
        await expect(page.locator('#chat-preview-size')).toHaveAttribute('aria-pressed','false');
        assertDock(await settledDock(page,regime.name+' '+language+' restored compact'));
      });
      // Closing and reopening use real controls; they must retain the unsent draft.
      await activate(page,'#chat-preview-close');
      await expect(page.locator('#chat-preview-panel')).not.toBeVisible();
      await expect(page.locator('#chat-preview-toggle')).toHaveAttribute('aria-expanded','false');
      await focusedControl(page,'#chat-preview-toggle');
      assertDock(await settledDock(page,regime.name+' closed again'));
      const beforeOpen=await storage(page);
      await page.keyboard.press('Enter');
      await expect(page.locator('#chat-preview-input')).toBeFocused();
      await expect(page.locator('#chat-preview-input')).toHaveValue(privateDraft);
      expect(await storage(page)).toEqual(beforeOpen);
    }
    await checked.verify();
  }finally{try{await evidence(group+'-open-chat-dock',observations);}finally{await checked.context.close();}}
});
