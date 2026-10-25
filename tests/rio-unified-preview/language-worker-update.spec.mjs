import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStaticFixture} from './static-fixture.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(repository,'render-dist');
const OLD_ROOT='palaco-rio-shell-v37-unified-language';
const NEXT_ROOT='palaco-rio-shell-v57-chat-dock';
const OLD_APP='palaco-rio-start-v0.1-5';
const NEXT_APP='palaco-rio-start-v0.1-9';
const UNRELATED='unrelated-rio-language-migration';
const CONTACT_KEY='palaco.rio.start.contacts.v1';
const ROOT_ASSETS=['/','/index.html','/styles.css','/app.js','/rio-engine-web.mjs','/engine.mjs','/chat-preview.mjs','/integration.mjs','/manifest.webmanifest','/icon-192.svg','/icon-512.svg','/citadel-icon.png','/hara-icon.png','/mundo-icon.png','/rio/reception/nova.png'].sort();
const OLD_ROOT_ASSETS=ROOT_ASSETS.filter(path=>!['/citadel-icon.png','/hara-icon.png','/mundo-icon.png'].includes(path));
const APP_ASSETS=['/rio/','/rio/start.js','/rio/manifest.webmanifest','/rio/icon-192.png','/rio/icon-512.png'].sort();
const expectedCaches=(...names)=>names.map(name=>({name,paths:name===UNRELATED?['/unrelated-language-migration']:name===OLD_ROOT?OLD_ROOT_ASSETS:name===NEXT_ROOT?ROOT_ASSETS:APP_ASSETS})).sort((a,b)=>a.name.localeCompare(b.name));

test.beforeAll(()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
});

async function cacheContents(page){
  return page.evaluate(async()=>{
    const result=[];
    for(const name of await caches.keys()){
      const cache=await caches.open(name);
      result.push({name,paths:(await cache.keys()).map(request=>new URL(request.url).pathname).sort()});
    }
    return result.sort((a,b)=>a.name.localeCompare(b.name));
  });
}
async function registrationState(page,path){
  return page.evaluate(async path=>{
    const registration=await navigator.serviceWorker.getRegistration(location.origin+path);
    return registration?{scope:registration.scope,active:registration.active?.state||null,waiting:registration.waiting?.state||null}:null;
  },path);
}
async function installed(page,origin,path){
  await expect.poll(()=>registrationState(page,path)).toEqual({scope:origin+path,active:'activated',waiting:null});
  const script=origin+path+'sw.js';
  if(await page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)!==script)await page.reload();
  expect(await page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toBe(script);
}
async function preserved(page,contact){
  expect(await page.evaluate(key=>localStorage.getItem(key),CONTACT_KEY)).toBe(contact);
  expect(await page.evaluate(async name=>(await(await caches.open(name)).match('/unrelated-language-migration')).text(),UNRELATED)).toBe('TST independent public cache');
}
async function newLanguageLink(page,selector){
  await expect(page.locator(selector)).toHaveAttribute('href','/rio/reception/#nova-explained:ar');
  await expect(page.locator(selector)).toHaveAttribute('hreflang','nl');
  const url=new URL(await page.locator(selector).getAttribute('href'),page.url());
  expect(url.search).toBe('');
  expect(url.hash).toBe('#nova-explained:ar');
}

test('fixed v37 and v5 workers genuinely wait, activate independently and keep contacts and unrelated cache through offline language handoff',async({browser},info)=>{
  // Fixed historical worker bytes control newly generated pages. This proves the
  // worker/cache transition, not a reconstruction of the exact historical UI.
  const oldRoot=await readFile(new URL('./fixtures/root-v37-sw.js',import.meta.url));
  const oldApp=await readFile(new URL('./fixtures/app-v5-sw.js',import.meta.url));
  expect(createHash('sha256').update(oldRoot).digest('hex')).toBe('a44e3295e908c92d83e7d92e9c32e89ae42079a6a7a8c9ca32f6d1a3c80bf742');
  expect(createHash('sha256').update(oldApp).digest('hex')).toBe('4af7f56c4ae3d4616d701ba697b2bee1a28aaf015f230b231c71c604753fac9f');
  const nextRoot=await readFile(resolve(output,'sw.js'));
  const nextApp=await readFile(resolve(output,'rio/sw.js'));
  expect(nextRoot.toString()).toContain(NEXT_ROOT);
  expect(nextApp.toString()).toContain(NEXT_APP);
  for(const worker of [oldRoot,oldApp,nextRoot,nextApp])expect(worker.toString()).not.toContain('skipWaiting');
  expect(nextRoot.toString()).not.toContain('clients.claim');
  // The existing app worker claims only clients within its /rio/ registration;
  // the new root worker deliberately leaves its active root page alone.
  expect(oldApp.toString()).toContain('await self.clients.claim()');
  expect(nextApp.toString()).toContain('await self.clients.claim()');
  let current=false;
  const fixture=await startStaticFixture(output,{
    rootWorker:()=>current?nextRoot:oldRoot,
    appWorker:()=>current?nextApp:oldApp,
  });
  const {viewport,isMobile,hasTouch}=info.project.use;
  const context=await browser.newContext({viewport,isMobile,hasTouch,locale:'en-US'});
  const errors=[],external=[],api=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>{
    const url=new URL(request.url());
    if(/^https?:$/.test(url.protocol)&&url.origin!==fixture.origin)external.push(request.url());
    if(url.pathname.startsWith('/api/')||request.method()!=='GET')api.push(request.method()+' '+url.pathname);
  });
  try{
    const root=await context.newPage();
    await root.goto(fixture.origin+'/');
    await installed(root,fixture.origin,'/');
    const app=await context.newPage();
    await app.goto(fixture.origin+'/rio/');
    await installed(app,fixture.origin,'/rio/');
    await app.locator('#tab-contacts').click();
    await app.locator('#contact-name').fill('TST migratiebezoeker');
    await app.locator('#add-contact').click();
    await expect(app.locator('#contact-list .name')).toHaveText('TST migratiebezoeker');
    const contact=await app.evaluate(key=>localStorage.getItem(key),CONTACT_KEY);
    expect(contact).toContain('TST migratiebezoeker');
    await app.evaluate(async name=>{
      const cache=await caches.open(name);
      await cache.put('/unrelated-language-migration',new Response('TST independent public cache'));
    },UNRELATED);
    expect(await cacheContents(app)).toEqual(expectedCaches(OLD_ROOT,OLD_APP,UNRELATED));
    let rootNavigations=0,appNavigations=0;
    root.on('framenavigated',frame=>{if(frame===root.mainFrame())rootNavigations++;});
    app.on('framenavigated',frame=>{if(frame===app.mainFrame())appNavigations++;});

    current=true;
    await root.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration(location.origin+'/')).update();});
    await app.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration(location.origin+'/rio/')).update();});
    await expect.poll(()=>registrationState(root,'/')).toEqual({scope:fixture.origin+'/',active:'activated',waiting:'installed'});
    await expect.poll(()=>registrationState(app,'/rio/')).toEqual({scope:fixture.origin+'/rio/',active:'activated',waiting:'installed'});
    expect([rootNavigations,appNavigations]).toEqual([0,0]);
    expect(await cacheContents(app)).toEqual(expectedCaches(OLD_ROOT,NEXT_ROOT,OLD_APP,NEXT_APP,UNRELATED));
    await preserved(app,contact);
    await expect(app.locator('#contact-list .name')).toHaveText('TST migratiebezoeker');

    await app.close();
    await expect.poll(()=>registrationState(root,'/rio/')).toEqual({scope:fixture.origin+'/rio/',active:'activated',waiting:null});
    await expect.poll(()=>cacheContents(root)).toEqual(expectedCaches(OLD_ROOT,NEXT_ROOT,NEXT_APP,UNRELATED));
    expect(await registrationState(root,'/')).toEqual({scope:fixture.origin+'/',active:'activated',waiting:'installed'});
    expect(rootNavigations).toBe(0);
    await preserved(root,contact);
    const nextAppPage=await context.newPage();
    await nextAppPage.goto(fixture.origin+'/rio/');
    await installed(nextAppPage,fixture.origin,'/rio/');
    await nextAppPage.locator('#language').selectOption('ar');
    await newLanguageLink(nextAppPage,'#unified-reception');
    await expect(nextAppPage.locator('#contact-list .name')).toHaveText('TST migratiebezoeker');

    await root.close();
    await expect.poll(()=>registrationState(nextAppPage,'/')).toEqual({scope:fixture.origin+'/',active:'activated',waiting:null});
    await expect.poll(()=>cacheContents(nextAppPage)).toEqual(expectedCaches(NEXT_ROOT,NEXT_APP,UNRELATED));
    await preserved(nextAppPage,contact);
    const nextRootPage=await context.newPage();
    await nextRootPage.goto(fixture.origin+'/');
    await installed(nextRootPage,fixture.origin,'/');
    await nextRootPage.locator('.lang-btn[data-lang="ar"]').click();
    await newLanguageLink(nextRootPage,'#rio-unified-reception');

    await context.setOffline(true);
    const appReload=await nextAppPage.reload();
    expect(appReload.fromServiceWorker()).toBe(true);
    await expect(nextAppPage.locator('html')).toHaveAttribute('lang','ar');
    await newLanguageLink(nextAppPage,'#unified-reception');
    await expect(nextAppPage.locator('#contact-list .name')).toHaveText('TST migratiebezoeker');
    const rootReload=await nextRootPage.reload();
    expect(rootReload.fromServiceWorker()).toBe(true);
    await expect(nextRootPage.locator('html')).toHaveAttribute('lang','ar');
    await newLanguageLink(nextRootPage,'#rio-unified-reception');
    expect(await cacheContents(nextRootPage)).toEqual(expectedCaches(NEXT_ROOT,NEXT_APP,UNRELATED));
    await preserved(nextRootPage,contact);
    expect(await context.cookies()).toEqual([]);
    expect(errors).toEqual([]);expect(external).toEqual([]);expect(api).toEqual([]);
  }finally{await context.close();await fixture.close();}
});
