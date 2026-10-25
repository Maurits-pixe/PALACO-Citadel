import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, realpath, rm} from 'node:fs/promises';
import {resolve, join, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {startStaticFixture} from './static-fixture.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const previewOrigin='https://palaco-rio-preview-temporary.onrender.com';
const rootLanguages=['nl','en','de','fr','es','pt','ru','eo','pl','ar','zh'];
const languages=['nl','en','de','fr','es','it','pt','ru','zh','ar','eo','pl'];
const normalized=code=>code==='zh'?'zh-Hans':code;
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
    if(/^https?:$/.test(url.protocol)&&url.origin!==fixture.origin)foreign.push(request.url());
  });
  // Observe and block unexpected public traffic; the file-link test replaces
  // its one exact destination with a local response rather than contacting it.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin
      ?route.continue():route.abort('blockedbyclient');
  });
  await context.addInitScript(()=>{
    if(location.pathname!=='/rio/reception/')return;
    const accesses=[];
    Object.defineProperty(window,'__novaHandoffStorageAccesses',{value:accesses});
    for(const name of ['localStorage','sessionStorage']){
      const descriptor=Object.getOwnPropertyDescriptor(window,name);
      Object.defineProperty(window,name,{configurable:true,get(){
        accesses.push(name);
        return descriptor.get.call(window);
      }});
    }
  });
  return {context,async verify({expectedForeign=[]}={}){
    expect(errors).toEqual([]);
    expect(api).toEqual([]);
    expect(foreign).toEqual(expectedForeign);
    expect(await context.cookies()).toEqual([]);
  }};
}

async function novaState(page,code){
  await expect(page.locator('#nova-language')).toHaveValue(code);
  await expect(page.locator('#nova-explained')).toHaveAttribute('lang',normalized(code));
  await expect(page.locator('#nova-explained')).toHaveAttribute('dir',code==='ar'?'rtl':'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang','nl');
  await expect(page.locator('[data-nova-copy="boundary"]')).toContainText('BRI9ADE');
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state','unconfirmed');
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(page.locator('[aria-live="assertive"]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__novaHandoffStorageAccesses)).toEqual([]);
  expect(new URL(page.url()).search).toBe('');
}

test('explicit root and online app language choices reach NOVA through a language-only fragment with native keyboard focus',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    for(const source of ['root','app']){
      for(const code of source==='root'?rootLanguages:languages){
        await page.goto(fixture.origin+(source==='root'?'/':'/rio/'));
        if(source==='root')await page.locator('.lang-btn[data-lang="'+code+'"]').click();
        else await page.locator('#language').selectOption(code);
        const link=page.locator(source==='root'?'#rio-unified-reception':'#unified-reception');
        await expect(link).toHaveAttribute('href','/rio/reception/#nova-explained:'+code);
        await expect(link).toHaveAttribute('hreflang','nl');
        expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe(code);
        await link.focus();await page.keyboard.press('Enter');
        await expect(page).toHaveURL(fixture.origin+'/rio/reception/#nova-explained:'+code);
        await novaState(page,code);
        await expect(page.locator('#nova-explained')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#nova-language')).toBeFocused();
        const receivedUrl=page.url(),temporary=code==='eo'?'fr':'eo';
        await page.locator('#nova-language').selectOption(temporary);
        await novaState(page,temporary);
        expect(page.url()).toBe(receivedUrl);
        await expect(page.locator('#nova-language')).toBeFocused();
        // NOVA must not change the pre-existing root/app preference.
        await page.goto(fixture.origin+'/rio/');
        await expect(page.locator('#language')).toHaveValue(code);
        expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe(code);
      }
    }
    await checked.verify();
  }finally{await checked.context.close();}
});

test('only exact NOVA language fragments override browser fallback and valid hash changes preserve unrelated navigation',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    await page.locator('.lang-btn[data-lang="fr"]').click();
    // The URL's Arabic choice wins over both the English browser and French
    // root preference, without reading that preference from NOVA.
    await page.goto(fixture.origin+'/rio/reception/#nova-explained:ar');
    await novaState(page,'ar');
    for(const hash of ['', '#nova-explained', '#main',
      '#nova-explained:__proto__','#nova-explained:constructor','#nova-explained:zz',
      '#nova-explained:FR','#nova-explained:%66r','#nova-explained:fr:ar',
      '#nova-explained:fr?role=admin','#nova-explained:fr&actor=maurits',
      '#nova-explained:fr%0A','#nova-explained:%3Cscript%3E']){
      await page.goto(fixture.origin+'/rio/reception/'+hash);
      await page.reload();
      await novaState(page,'en');
    }
    await page.evaluate(()=>{location.hash='#nova-explained:fr';});
    await novaState(page,'fr');
    await expect(page.locator('#nova-explained')).toBeFocused();
    await page.locator('#nova-language').selectOption('eo');
    await page.locator('#nova-language').focus();
    await page.evaluate(()=>{location.hash='#nova-explained:constructor';});
    await novaState(page,'eo');
    await expect(page.locator('#nova-language')).toBeFocused();
    for(const hash of ['#nova-explained','#main']){
      await page.evaluate(hash=>{location.hash=hash;},hash);
      await novaState(page,'eo');
    }
    await page.evaluate(()=>{location.hash='#nova-explained:ar';});
    await novaState(page,'ar');
    await expect(page.locator('#nova-explained')).toBeFocused();
    await page.goto(fixture.origin+'/');
    expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe('fr');
    await checked.verify();
    for(const [locale,code]of [['fr-CA','fr'],['ja-JP','nl']]){
      const fallback=await checkedContext(browser,{locale}),fallbackPage=await fallback.context.newPage();
      try{
        await fallbackPage.goto(fixture.origin+'/rio/reception/#nova-explained:zz');
        await novaState(fallbackPage,code);
        await fallback.verify();
      }finally{await fallback.context.close();}
    }
  }finally{await checked.context.close();}
});

test('an incoming language fragment keeps an honest readable Dutch fallback when scripts are disabled',async({browser})=>{
  const checked=await checkedContext(browser,{javaScriptEnabled:false}),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/reception/#nova-explained:ar');
    await expect(page.locator('#nova-explained')).toHaveAttribute('lang','nl');
    await expect(page.locator('#nova-explained')).toHaveAttribute('dir','ltr');
    await expect(page.locator('#nova-language')).toBeDisabled();
    await expect(page.locator('#nova-explained-title')).toHaveText('Wie is NOVA?');
    await expect(page.locator('#nova-no-script')).toBeVisible();
    await expect(page.locator('#nova-no-script')).toContainText('Zonder JavaScript');
    await expect(page.locator('[data-nova-copy="boundary"]')).toContainText('opent geen echte chat');
    await expect(page.locator('.hero-link[href="#nova-explained"]')).toHaveCount(1);
    await checked.verify();
  }finally{await checked.context.close();}
});

test('standalone file links keep the fixed public destination without language transfer online and offline',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),requests=[];
  let directory;
  await checked.context.addInitScript(()=>{
    if(location.protocol==='file:')Object.defineProperty(window,'sessionStorage',{get(){
      window.__fileHandoffSessionReads=(window.__fileHandoffSessionReads||0)+1;
      throw new DOMException('Blocked','SecurityError');
    }});
  });
  await checked.context.route(previewOrigin+'/rio/reception/',async route=>{
    const request=route.request();
    requests.push({url:request.url(),headers:await request.allHeaders()});
    await route.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{
      'Content-Security-Policy':"default-src 'none'; img-src data:; base-uri 'none'; form-action 'none'",
      'Referrer-Policy':'no-referrer','Cache-Control':'no-store',
    },body:'<!doctype html><html lang="nl"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Onderschepte preview</title></head><body><h1>Lokale onderschepte bestemming</h1></body></html>'});
  });
  try{
    directory=await mkdtemp(join(tmpdir(),'rio-nova-handoff-'));
    const file=join(directory,'RIO-offline.html');
    await writeFile(file,await readFile(resolve(repository,'render-dist/rio/download')));
    for(const offline of [false,true]){
      await checked.context.setOffline(offline);
      await page.goto(pathToFileURL(file).href);
      await page.locator('#language').selectOption(offline?'ar':'pt');
      const link=page.locator('#unified-reception');
      await expect(link).toHaveAttribute('href',previewOrigin+'/rio/reception/');
      await expect(link).toHaveAttribute('target','_blank');
      expect((await link.getAttribute('rel')).split(/\s+/).sort()).toEqual(['noopener','noreferrer']);
      const url=new URL(await link.getAttribute('href'));
      expect([url.search,url.hash,url.username,url.password]).toEqual(['','','','']);
      expect(await page.evaluate(()=>window.__fileHandoffSessionReads||0)).toBe(0);
      if(!offline){
        expect(requests).toEqual([]);
        await link.focus();
        const popupPromise=checked.context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const popup=await popupPromise;
        await popup.waitForLoadState('load');
        expect(popup.url()).toBe(previewOrigin+'/rio/reception/');
        expect(await popup.evaluate(()=>({opener:window.opener===null,referrer:document.referrer}))).toEqual({opener:true,referrer:''});
        expect(requests).toHaveLength(1);
        expect(requests[0].headers.referer).toBeUndefined();
        expect(requests[0].headers.cookie).toBeUndefined();
        expect(requests[0].headers.authorization).toBeUndefined();
        await popup.close();await page.bringToFront();
      }
    }
    expect(requests.map(request=>request.url)).toEqual([previewOrigin+'/rio/reception/']);
    await checked.verify({expectedForeign:[previewOrigin+'/rio/reception/']});
  }finally{
    await checked.context.close();
    if(directory){
      const actual=await realpath(directory),base=await realpath(tmpdir()),child=relative(base,actual);
      if(!child.startsWith('rio-nova-handoff-')||isAbsolute(child)||child.includes(sep))throw Error('UNSAFE_HANDOFF_DIRECTORY');
      await rm(actual,{recursive:true,force:true});
    }
  }
});

test('incoming language routes remain readable at 320 pixels and focus the explanation before its 44 pixel selector',async({browser})=>{
  const checked=await checkedContext(browser,{viewport:{width:320,height:844}}),page=await checked.context.newPage();
  try{
    for(const code of languages){
      await page.goto(fixture.origin+'/rio/reception/#nova-explained:'+code);
      await novaState(page,code);
      await expect(page.locator('#nova-explained')).toBeFocused();
      const top=await page.locator('#nova-explained').evaluate(element=>element.getBoundingClientRect().top);
      expect(top,code+' route scroll position').toBeGreaterThanOrEqual(0);
      expect(top,code+' route scroll position').toBeLessThan(100);
      await page.keyboard.press('Tab');
      await expect(page.locator('#nova-language')).toBeFocused();
      const box=await page.locator('#nova-language').boundingBox();
      expect(box.height,code+' selector height').toBeGreaterThanOrEqual(44);
      expect(box.width,code+' selector width').toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),code+' horizontal overflow').toBe(true);
    }
    await checked.verify();
  }finally{await checked.context.close();}
});

test('local NOVA links and mobile navigation wrap within 320 pixels at actual double text size',async({browser})=>{
  const checked=await checkedContext(browser,{viewport:{width:320,height:900}}),page=await checked.context.newPage();
  try{
    for(const source of ['root','app']){
      await page.goto(fixture.origin+(source==='root'?'/':'/rio/'));
      await page.evaluate(()=>{document.documentElement.style.fontSize='32px';document.body.style.fontSize='32px';});
      expect(await page.evaluate(()=>[getComputedStyle(document.documentElement).fontSize,getComputedStyle(document.body).fontSize])).toEqual(['32px','32px']);
      for(const code of source==='root'?rootLanguages:languages){
        if(source==='root')await page.locator('.lang-btn[data-lang="'+code+'"]').click();
        else await page.locator('#language').selectOption(code);
        const selector=source==='root'?'#rio-unified-reception':'#unified-reception';
        await expect(page.locator(selector)).toHaveAttribute('href','/rio/reception/#nova-explained:'+code);
        expect(await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth})),source+'/'+code+' horizontal overflow').toEqual({scrollWidth:320,viewport:320});
        const targets=source==='root'?[selector,'.mobile-nav a']: [selector];
        for(const target of targets)for(const link of await page.locator(target).all()){
          const box=await link.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
        }
      }
    }
    await checked.verify();
  }finally{await checked.context.close();}
});
