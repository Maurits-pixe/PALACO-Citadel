import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, realpath, rm} from 'node:fs/promises';
import {resolve, join, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {startStaticFixture} from './static-fixture.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
let fixture;
let surface;
test.beforeEach(async({},info)=>{const use=info.project.use;surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  fixture=await startStaticFixture(resolve(repository,'render-dist'));
});
test.afterAll(async()=>{await fixture?.close();});
const normalized=language=>language==='zh'?'zh-Hans':language;
async function language(page,code){
  await expect(page.locator('html')).toHaveAttribute('lang',normalized(code));
  await expect(page.locator('html')).toHaveAttribute('dir',code==='ar'?'rtl':'ltr');
}
async function checkedContext(browser,options={}){
  const context=await browser.newContext({...surface,locale:'en-US',...options});
  const errors=[],api=[],foreign=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>{
    const url=new URL(request.url());
    if(url.pathname.startsWith('/api/')||request.method()!=='GET')api.push(request.method()+' '+url.pathname);
    if(/^https?:/.test(url.protocol)&&url.origin!==fixture.origin)foreign.push(url.origin);
  });
  return {context,async close(){expect(errors).toEqual([]);expect(api).toEqual([]);expect(foreign).toEqual([]);await context.close();}};
}

test('NOVA explains its role and unchanged boundaries in all twelve languages without storage or API access',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/reception/');
    const titles={nl:'Wie is NOVA?',en:'Who is NOVA?',de:'Wer ist NOVA?',fr:'Qui est NOVA ?',es:'¿Quién es NOVA?',it:'Chi è NOVA?',pt:'Quem é a NOVA?',ru:'Кто такая NOVA?',zh:'NOVA 是谁？',ar:'من هي NOVA؟',eo:'Kiu estas NOVA?',pl:'Kim jest NOVA?'};
    const boundaries=new Set(),scopes=new Set();
    await expect(page.locator('#nova-language option')).toHaveCount(12);
    for(const [code,title]of Object.entries(titles)){
      await page.locator('#nova-language').selectOption(code);
      await expect(page.locator('#nova-explained')).toHaveAttribute('lang',normalized(code));
      await expect(page.locator('#nova-explained')).toHaveAttribute('dir',code==='ar'?'rtl':'ltr');
      await expect(page.locator('#nova-explained-title')).toHaveText(title);
      await expect(page.locator('html')).toHaveAttribute('lang','nl');
      for(const element of await page.locator('[data-nova-copy]').all()){
        const copy=(await element.textContent()).trim();expect(copy.length).toBeGreaterThan(3);expect(copy).not.toMatch(/undefined|\[object Object\]/);
      }
      const boundary=await page.locator('[data-nova-copy="boundary"]').textContent();
      expect(boundary).toContain('BRI9ADE');boundaries.add(boundary);
      scopes.add(await page.locator('#nova-language-scope').textContent());
      await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state','unconfirmed');
      await expect(page.locator('#refresh-availability')).toBeDisabled();
      await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
      expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
      const bounds=await page.locator('#nova-language').boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    expect(boundaries.size).toBe(12);expect(scopes.size).toBe(12);
    expect(await checked.context.cookies()).toEqual([]);
  }finally{await checked.close();}
});

test('NOVA has a readable Dutch fallback and honest disabled language choice without JavaScript',async({browser})=>{
  const checked=await checkedContext(browser,{javaScriptEnabled:false}),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/reception/');
    await expect(page.locator('#nova-explained-title')).toHaveText('Wie is NOVA?');
    await expect(page.locator('#nova-language')).toBeDisabled();
    await expect(page.locator('#nova-no-script')).toContainText('Zonder JavaScript');
    await expect(page.locator('#nova-no-script')).toBeVisible();
    await expect(page.locator('[data-nova-copy="boundary"]')).toContainText('opent geen echte chat');
  }finally{await checked.close();}
});

test('explicit shared language survives root to app, reload and return without query or contact transfer',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    for(const code of ['fr','ar','zh','it','nl']){
      await page.goto(fixture.origin+'/');
      await page.locator('.lang-btn[data-lang="'+code+'"]').click();
      await expect(page.locator('#rio-unified-reception')).toHaveAttribute('hreflang','nl');
      await page.locator('#rio-unified-offline').click();await language(page,code);
      expect(new URL(page.url()).search).toBe('');
      await page.reload();await language(page,code);
      await expect(page.locator('#unified-reception')).toHaveAttribute('hreflang','nl');
      await page.locator('#unified-home').click();
      await expect(page.locator('html')).toHaveAttribute('lang',code);
      await expect(page.locator('html')).toHaveAttribute('dir',code==='ar'?'rtl':'ltr');
      expect(await page.evaluate(()=>Object.keys(sessionStorage))).toEqual(['palaco-language']);
      expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe(code);
      expect(await page.evaluate(()=>localStorage.getItem('rio-visitor-name'))).toBeNull();
    }
    expect(await checked.context.cookies()).toEqual([]);
  }finally{await checked.close();}
});

test('Italian stays selected across app and root while invalid preferences keep the safe fallback',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/rio/');
    for(const code of ['it']){
      await page.locator('#language').selectOption(code);
      await page.locator('#unified-home').click();
      await expect(page.locator('html')).toHaveAttribute('lang',code);
      await expect(page.locator('#rio-unified-reception')).toHaveAttribute('href','/rio/reception/#nova-explained:it');
      expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe(code);
      await page.locator('#rio-unified-offline').click();await language(page,code);
    }
    for(const invalid of ['__proto__','constructor','zz','<script>']){
      await page.evaluate(value=>sessionStorage.setItem('palaco-language',value),invalid);
      await page.goto(fixture.origin+'/');await expect(page.locator('html')).toHaveAttribute('lang','en');
      await page.locator('#rio-unified-offline').click();await language(page,'nl');
    }
  }finally{await checked.close();}
});

test('blocked storage reads and quota failures leave both language controls and NOVA explanation usable',async({browser})=>{
  for(const mode of ['blocked','quota']){
    const checked=await checkedContext(browser),page=await checked.context.newPage();
    try{
      await checked.context.addInitScript(mode=>{
        if(mode==='blocked')for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('Blocked','SecurityError');}});
        else Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};
      },mode);
      await page.goto(fixture.origin+'/');
      await page.locator('.lang-btn[data-lang="fr"]').click();await expect(page.locator('html')).toHaveAttribute('lang','fr');
      await page.locator('#rio-unified-offline').click();await page.locator('#language').selectOption('ar');await language(page,'ar');
      await page.locator('#unified-reception').click();await page.locator('#nova-language').selectOption('eo');
      await expect(page.locator('#nova-explained-title')).toHaveText('Kiu estas NOVA?');
    }finally{await checked.close();}
  }
});

test('both installed apps preserve language across real offline navigation without query cache variants',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');await page.locator('.lang-btn[data-lang="ar"]').click();
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();
    await page.locator('#rio-unified-offline').click();await language(page,'ar');
    await expect.poll(()=>page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration(location.origin+'/rio/');
      return registration?.active?.scriptURL;
    })).toBe(fixture.origin+'/rio/sw.js');
    await page.reload();await language(page,'ar');
    await checked.context.setOffline(true);
    await page.locator('#unified-home').click();await expect(page.locator('html')).toHaveAttribute('lang','ar');
    await page.locator('#rio-unified-offline').click();await language(page,'ar');
    expect(new URL(page.url()).search).toBe('');
    const keys=await page.evaluate(()=>caches.keys());
    expect(keys).toContain('palaco-rio-shell-v63-hara-dashboard');expect(keys).toContain('palaco-rio-start-v0.1-9');
    await page.locator('#language').selectOption('fr');await page.locator('#unified-home').click();
    await expect(page.locator('html')).toHaveAttribute('lang','fr');
  }finally{await checked.close();}
});

test('an incoming app language follows later choices through reload, offline and blocked storage without adding history',async({browser})=>{
  for(const mode of ['normal','blocked','quota']){
    const checked=await checkedContext(browser),page=await checked.context.newPage();
    try{
      if(mode!=='normal')await checked.context.addInitScript(mode=>{
        if(mode==='blocked')Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked','SecurityError');}});
        else Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};
      },mode);
      await page.goto(fixture.origin+'/rio/?lang=fr#install');await language(page,'fr');
      expect((await page.locator('#language').boundingBox()).height).toBeGreaterThanOrEqual(44);
      await page.evaluate(()=>navigator.serviceWorker.ready);
      await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toBe(fixture.origin+'/rio/sw.js');
      const historyLength=await page.evaluate(()=>{
        history.replaceState({publicTest:'TST-language-choice'},'',location.href);
        return history.length;
      });
      for(const code of ['ar','zh','eo']){
        await page.locator('#language').selectOption(code);await language(page,code);
        if(code==='eo')await checked.context.setOffline(true);
        await page.reload();await language(page,code);
        expect(new URL(page.url()).search).toBe('?lang='+code);
        expect(new URL(page.url()).hash).toBe('#install');
        expect(await page.evaluate(()=>({length:history.length,state:history.state}))).toEqual({
          length:historyLength,state:{publicTest:'TST-language-choice'},
        });
      }
      const keys=await page.evaluate(async()=>{
        const cache=await caches.open('palaco-rio-start-v0.1-9');
        return (await cache.keys()).map(request=>new URL(request.url).search);
      });
      expect(keys.length).toBeGreaterThan(0);expect(keys.every(query=>query==='')).toBe(true);
    }finally{await checked.close();}
  }
});

test('explicit app query has priority while the offline download adds no session-language access',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();let directory;
  try{
    await checked.context.addInitScript(()=>{if(location.protocol!=='file:')sessionStorage.setItem('palaco-language','fr');});
    await page.goto(fixture.origin+'/rio/?lang=ar');await language(page,'ar');
    expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe('ar');
    // A browser refusing URL replacement must not disable the language control.
    await page.evaluate(()=>{history.replaceState=()=>{throw new DOMException('Blocked','SecurityError');};});
    await page.locator('#language').selectOption('de');await language(page,'de');
    expect(new URL(page.url()).search).toBe('?lang=ar');
    directory=await mkdtemp(join(tmpdir(),'rio-language-download-'));
    const file=join(directory,'RIO-offline.html');await writeFile(file,await readFile(resolve(repository,'render-dist/rio/download')));
    await checked.context.addInitScript(()=>{
      if(location.protocol==='file:'){
        Object.defineProperty(window,'sessionStorage',{get(){window.__languageStorageReads=(window.__languageStorageReads||0)+1;throw new DOMException('Blocked','SecurityError');}});
        history.replaceState=()=>{window.__languageHistoryWrites=(window.__languageHistoryWrites||0)+1;throw new DOMException('Blocked','SecurityError');};
      }
    });
    await checked.context.setOffline(true);await page.goto(pathToFileURL(file).href);
    await page.locator('#language').selectOption('pt');await language(page,'pt');
    expect(await page.evaluate(()=>window.__languageStorageReads||0)).toBe(0);
    expect(await page.evaluate(()=>window.__languageHistoryWrites||0)).toBe(0);
  }finally{
    await checked.close();
    if(directory){const actual=await realpath(directory),base=await realpath(tmpdir()),child=relative(base,actual);if(!child.startsWith('rio-language-download-')||isAbsolute(child)||child.includes(sep))throw Error('UNSAFE_DOWNLOAD_DIRECTORY');await rm(actual,{recursive:true,force:true});}
  }
});
