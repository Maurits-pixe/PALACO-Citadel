import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStaticFixture} from './static-fixture.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const trialOrigin='https://palaco-ambassades.onrender.com';
const trialHost='palaco-ambassades.onrender.com';
const languages=['nl','en','de','fr','es','it','pt','ru','zh','ar','eo'];
const routes=[
  {id:'nova-guide-device',path:'/rio/device-test/',action:'deviceAction'},
  {id:'nova-guide-reception',path:'/rio/nova/',action:'receptionAction'},
];
let fixture;
let surface;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  fixture=await startStaticFixture(resolve(repository,'render-dist'));
});
test.afterAll(async()=>{await fixture?.close();});

async function checkedContext(browser,options={}){
  const context=await browser.newContext({...surface,locale:'en-US',...options});
  const errors=[],api=[],foreign=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>{
    const url=new URL(request.url());
    if(url.pathname.startsWith('/api/')||request.method()!=='GET')api.push(request.method()+' '+url.pathname);
    if(/^https?:$/.test(url.protocol)&&url.origin!==fixture.origin)foreign.push({url:request.url(),method:request.method()});
  });
  // Unexpected third-party requests are observed and blocked rather than sent.
  // The action test installs its exact trial-host fixture after this guard.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.origin===fixture.origin?route.continue():route.abort('blockedbyclient');
  });
  await context.addInitScript(()=>{
    if(Object.hasOwn(window,'__novaRouteStorageAccesses'))return;
    const accesses=[];
    Object.defineProperty(window,'__novaRouteStorageAccesses',{value:accesses});
    for(const name of ['localStorage','sessionStorage']){
      const descriptor=Object.getOwnPropertyDescriptor(window,name);
      Object.defineProperty(window,name,{configurable:true,get(){
        accesses.push(name);
        return descriptor.get.call(window);
      }});
    }
  });
  return {context,foreign,async verify(page,{expectedForeign=[]}={}){
    expect(errors).toEqual([]);
    expect(api).toEqual([]);
    expect(foreign).toEqual(expectedForeign);
    if(options.javaScriptEnabled!==false)expect(await page.evaluate(()=>window.__novaRouteStorageAccesses)).toEqual([]);
    const state=await context.storageState();
    expect(state.cookies).toEqual([]);
    expect(state.origins.flatMap(origin=>origin.localStorage)).toEqual([]);
  }};
}

async function routeContract(page){
  for(const route of routes){
    const link=page.locator('#'+route.id);
    await expect(link).toHaveAttribute('href',trialOrigin+route.path);
    await expect(link).toHaveAttribute('target','_blank');
    await expect(link).toHaveAttribute('hreflang','nl');
    await expect(link).toHaveAttribute('aria-describedby','nova-route-note');
    expect((await link.getAttribute('rel')).split(/\s+/).sort()).toEqual(['noopener','noreferrer']);
    const action=await link.locator('[data-nova-route-copy="'+route.action+'"]').textContent();
    await expect(link).toHaveAccessibleName(action.trim());
    const url=new URL(await link.getAttribute('href'));
    expect([url.search,url.hash,url.username,url.password]).toEqual(['','','','']);
  }
  const destination=page.locator('#nova-trial-destination');
  await expect(destination).toBeVisible();
  const host=destination.locator('bdi');
  await expect(host).toHaveText(trialHost);
  await expect(host).toHaveAttribute('dir','ltr');
  await expect(host).toHaveAttribute('lang','en');
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(page.locator('[aria-live="assertive"]')).toHaveCount(0);
}

test('all eleven NOVA languages explain the next routes before any external request or storage access',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/reception/#nova-explained');
    const variants=new Map();
    for(const code of languages){
      await page.locator('#nova-language').selectOption(code);
      await expect(page.locator('#nova-explained')).toHaveAttribute('lang',code==='zh'?'zh-Hans':code);
      await expect(page.locator('#nova-explained')).toHaveAttribute('dir',code==='ar'?'rtl':'ltr');
      await expect(page.locator('html')).toHaveAttribute('lang','nl');
      const fields=page.locator('[data-nova-route-copy]');
      for(const key of ['title','deviceCopy','receptionCopy','deviceAction','receptionAction','destination']){
        await expect(page.locator('[data-nova-route-copy="'+key+'"]')).toHaveCount(1);
      }
      for(const field of await fields.all()){
        const key=await field.getAttribute('data-nova-route-copy');
        const copy=(await field.textContent()).trim();
        expect(copy.length).toBeGreaterThan(3);
        expect(copy).not.toMatch(/undefined|\[object Object\]|<script/i);
        if(!variants.has(key))variants.set(key,new Set());
        variants.get(key).add(copy);
      }
      const note=(await page.locator('#nova-route-note').textContent()).trim();
      expect(note.length).toBeGreaterThan(20);
      if(!variants.has('route-note'))variants.set('route-note',new Set());
      variants.get('route-note').add(note);
      await routeContract(page);
      await checked.verify(page);
    }
    for(const [key,values]of variants)expect(values.size,key+' must be translated in every supported language').toBe(11);
  }finally{await checked.context.close();}
});

test('without JavaScript the Dutch route explanation and both fixed destinations remain usable',async({browser})=>{
  const checked=await checkedContext(browser,{javaScriptEnabled:false}),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/reception/#nova-explained');
    await expect(page.locator('#nova-language')).toBeDisabled();
    await expect(page.locator('#nova-no-script')).toBeVisible();
    await expect(page.locator('#nova-explained')).toHaveAttribute('lang','nl');
    await expect(page.locator('#nova-route-note')).toContainText('Nederlands');
    await expect(page.locator('#nova-route-note')).toContainText('nieuw tabblad');
    await expect(page.locator('[data-nova-route-copy="deviceCopy"]')).not.toBeEmpty();
    await expect(page.locator('[data-nova-route-copy="receptionCopy"]')).not.toBeEmpty();
    await routeContract(page);
    await checked.verify(page);
  }finally{await checked.context.close();}
});

test('native keyboard route choices open only the selected trial without referrer, opener or language transfer',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),trialRequests=[];
  await checked.context.route(trialOrigin+'/**',async route=>{
    const request=route.request();
    trialRequests.push({url:request.url(),method:request.method(),headers:await request.allHeaders()});
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{
      'Content-Security-Policy':"default-src 'none'; img-src data:; base-uri 'none'; form-action 'none'",
      'Referrer-Policy':'no-referrer','Cache-Control':'no-store',
    },body:'<!doctype html><html lang="nl"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Lokale proefroute</title></head><body><h1>Alleen een onderschepte testbestemming</h1></body></html>'});
  });
  try{
    await page.goto(fixture.origin+'/rio/reception/#nova-explained');
    await page.locator('#nova-language').selectOption('ar');
    const parentUrl=page.url(),parentNote=await page.locator('#nova-route-note').textContent();
    await page.locator('#nova-language').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#nova-guide-device')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#nova-guide-reception')).toBeFocused();
    expect(trialRequests).toEqual([]);
    await checked.verify(page);
    for(const [index,route]of routes.entries()){
      await page.locator('#nova-language').focus();
      for(let tab=0;tab<=index;tab++)await page.keyboard.press('Tab');
      await expect(page.locator('#'+route.id)).toBeFocused();
      const popupPromise=checked.context.waitForEvent('page');
      await page.keyboard.press('Enter');
      const popup=await popupPromise;
      await popup.waitForLoadState('load');
      expect(popup.url()).toBe(trialOrigin+route.path);
      expect(await popup.evaluate(()=>({opener:window.opener===null,referrer:document.referrer}))).toEqual({opener:true,referrer:''});
      expect(trialRequests).toHaveLength(index+1);
      expect(trialRequests[index].method).toBe('GET');
      expect(trialRequests[index].url).toBe(trialOrigin+route.path);
      expect(trialRequests[index].headers.referer).toBeUndefined();
      expect(trialRequests[index].headers.cookie).toBeUndefined();
      expect(trialRequests[index].headers.authorization).toBeUndefined();
      await popup.close();
      await page.bringToFront();
      expect(page.url()).toBe(parentUrl);
      await expect(page.locator('#nova-language')).toHaveValue('ar');
      await expect(page.locator('#nova-route-note')).toHaveText(parentNote);
      await expect(page.locator('#nova-explained')).toHaveAttribute('dir','rtl');
    }
    await checked.verify(page,{expectedForeign:routes.map(route=>({url:trialOrigin+route.path,method:'GET'}))});
  }finally{await checked.context.close();}
});

test('translated route actions fit a 320px screen with actual 200 percent root text',async({browser})=>{
  const checked=await checkedContext(browser,{viewport:{width:320,height:844}}),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/reception/#nova-explained');
    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    expect(await page.evaluate(()=>getComputedStyle(document.body).fontSize)).toBe('32px');
    for(const code of languages){
      await page.locator('#nova-language').selectOption(code);
      for(const route of routes){
        const link=page.locator('#'+route.id);
        await link.scrollIntoViewIfNeeded();
        const box=await link.boundingBox();
        expect(box.height,code+' action height').toBeGreaterThanOrEqual(44);
        expect(box.width,code+' action width').toBeGreaterThanOrEqual(44);
        expect(box.x,code+' action left edge').toBeGreaterThanOrEqual(0);
        expect(box.x+box.width,code+' action right edge').toBeLessThanOrEqual(320);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),code+' horizontal overflow').toBe(true);
      await routeContract(page);
    }
    await checked.verify(page);
  }finally{await checked.context.close();}
});
