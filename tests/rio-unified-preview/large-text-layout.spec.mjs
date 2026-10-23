import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','en','de','fr','es','ar','zh'];
const dialogs=[
  {name:'chat-clear',cap:480,trigger:'#chat-preview-clear',dialog:'#chat-preview-clear-dialog',title:'#chat-preview-clear-title',warning:'#chat-preview-clear-warning',actions:'.chat-preview-clear-actions',first:'#chat-preview-clear-cancel',second:'#chat-preview-clear-confirm',restore:'#chat-preview-clear'},
  {name:'engine-clear',cap:520,trigger:'#engine-clear',dialog:'#engine-clear-dialog',title:'#engine-clear-title',warning:'#engine-clear-warning',actions:'.engine-clear-actions',first:'#engine-clear-cancel',second:'#engine-clear-confirm',restore:'#chat-preview-close'},
  {name:'departure',cap:540,trigger:'#rio-unified-reception',dialog:'#rio-departure-dialog',title:'#rio-departure-title',warning:'#rio-departure-warning',actions:'.rio-departure-actions',first:'#rio-departure-stay',second:'#rio-departure-new-tab',restore:'#rio-unified-reception'},
];
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
  const context=await browser.newContext({...surface,locale:'fr-FR'}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin
      ?route.continue():route.abort('blockedbyclient');
  });
  return {context,async verify(){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  }};
}
async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function font(page,size){await page.evaluate(value=>{
  document.documentElement.style.fontSize=value+'px';document.body.style.fontSize=value+'px';
},size);}
async function storage(page){return page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
  session:Object.fromEntries(Object.entries(sessionStorage))}));}
async function headerGeometry(page){
  return page.locator('.chat-preview-header').evaluate(header=>{
    const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const title=document.querySelector('#chat-preview-title'),words=[],css=getComputedStyle(title);
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    context.font=css.fontStyle+' '+css.fontWeight+' '+css.fontSize+' '+css.fontFamily;
    for(const match of title.textContent.matchAll(/[\p{L}\p{N}]+/gu)){
      const range=document.createRange();range.setStart(title.firstChild,match.index);range.setEnd(title.firstChild,match.index+match[0].length);
      words.push({word:match[0],naturalWidth:context.measureText(match[0]).width,
        rects:[...range.getClientRects()].map(r=>({left:r.left,top:r.top,width:r.width,height:r.height}))});
    }
    return {viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth},
      fontSize:getComputedStyle(document.documentElement).fontSize,header:box(header),
      titleColumn:box(header.firstElementChild),title:box(title),actions:box(header.lastElementChild),
      scrollWidth:header.scrollWidth,clientWidth:header.clientWidth,
      buttons:[...header.querySelectorAll('button')].map(button=>({id:button.id,...box(button),scrollWidth:button.scrollWidth,clientWidth:button.clientWidth})),words};
  });
}
async function dialogGeometry(page,contract){
  return page.locator(contract.dialog).evaluate((dialog,selectors)=>{
    const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const item=selector=>{const element=document.querySelector(selector);return {...box(element),scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};};
    const css=getComputedStyle(dialog);
    return {viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth},
      fontSize:getComputedStyle(document.documentElement).fontSize,dialog:box(dialog),
      maxWidth:css.maxWidth,boxSizing:css.boxSizing,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,
      scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,scrollTop:dialog.scrollTop,
      title:item(selectors.title),warning:item(selectors.warning),actions:item(selectors.actions),
      controls:[item(selectors.first),item(selectors.second)]};
  },contract);
}
function overlap(first,second){return Math.max(0,Math.min(first.right,second.right)-Math.max(first.left,second.left))
  *Math.max(0,Math.min(first.bottom,second.bottom)-Math.max(first.top,second.top));}
function containedHorizontally(child,parent){
  expect(child.left).toBeGreaterThanOrEqual(parent.left-1);expect(child.right).toBeLessThanOrEqual(parent.right+1);
}
async function focusedControl(page,selector){
  await expect(page.locator(selector)).toBeFocused();
  await page.locator(selector).evaluate(element=>element.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'}));
  const result=await page.locator(selector).evaluate(element=>{
    const box=element.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return {width:box.width,height:box.height,left:box.left,right:box.right,top:box.top,bottom:box.bottom,
      viewport:{width:innerWidth,height:innerHeight},hit:element.contains(hit),focusVisible:element.matches(':focus-visible')};
  });
  expect(result.width).toBeGreaterThanOrEqual(44);expect(result.height).toBeGreaterThanOrEqual(44);
  expect(result.left).toBeGreaterThanOrEqual(-1);expect(result.right).toBeLessThanOrEqual(result.viewport.width+1);
  expect(result.top).toBeGreaterThanOrEqual(-1);expect(result.bottom).toBeLessThanOrEqual(result.viewport.height+1);
  expect(result.hit).toBe(true);expect(result.focusVisible).toBe(true);
  return result;
}
async function saveEvidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-large-text-layout/1',project:test.info().project.name,source,observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}

test('seven chat headings keep full large-text width, separate actions and visible keyboard targets',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  const observations=[];
  try{
    await page.goto(fixture.origin+'/');await page.locator('#chat-preview-toggle').click();
    const draft='TST-header-draft-survives-resizing';
    await page.locator('#chat-preview-input').fill(draft);
    for(const [name,viewport,size]of [['default',surface.viewport,16],['narrow-double',{width:320,height:900},32],['wide-double',{width:1440,height:900},32]]){
      await page.setViewportSize(viewport);await font(page,size);
      for(const language of languages)await test.step(name+' '+language,async()=>{
        await activate(page,'.lang-btn[data-lang="'+language+'"]');
        const before=await storage(page);
        await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
        await page.locator('#chat-preview-title').focus();
        await page.locator('#chat-preview-title').evaluate(element=>element.scrollIntoView({behavior:'instant',block:'nearest'}));
        const geometry=await headerGeometry(page);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
        expect(overlap(geometry.titleColumn,geometry.actions)).toBeLessThanOrEqual(1);
        containedHorizontally(geometry.titleColumn,geometry.header);containedHorizontally(geometry.actions,geometry.header);
        expect(overlap(...geometry.buttons)).toBeLessThanOrEqual(1);
        for(const button of geometry.buttons){
          containedHorizontally(button,geometry.actions);
          expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);
          expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth+1);
        }
        if(size===32){
          expect(geometry.titleColumn.width).toBeGreaterThanOrEqual(geometry.header.width-1);
          expect(geometry.actions.top).toBeGreaterThanOrEqual(geometry.titleColumn.bottom-1);
        }
        if(language==='fr'){
          const bonjour=geometry.words.find(word=>word.word==='bonjour');
          expect(bonjour).toBeTruthy();expect(bonjour.naturalWidth).toBeLessThanOrEqual(geometry.title.width);
          expect(new Set(bonjour.rects.map(rect=>Math.round(rect.top))).size).toBe(1);
        }
        await page.keyboard.press('Tab');const sizeFocus=await focusedControl(page,'#chat-preview-size');
        await page.keyboard.press('Tab');const closeFocus=await focusedControl(page,'#chat-preview-close');
        await page.keyboard.press('Shift+Tab');await expect(page.locator('#chat-preview-size')).toBeFocused();
        let expanded;
        if(name==='wide-double'&&language==='fr')await test.step('expand and restore the French chat at doubled text',async()=>{
          const panel=page.locator('#chat-preview-panel'),sizeButton=page.locator('#chat-preview-size');
          await expect(sizeButton).toHaveAttribute('aria-pressed','false');
          await page.keyboard.press('Enter');
          await expect(sizeButton).toHaveAttribute('aria-pressed','true');
          await expect(panel).toHaveClass(/is-expanded/);
          const expandedGeometry=await headerGeometry(page);
          expect(overlap(expandedGeometry.titleColumn,expandedGeometry.actions)).toBeLessThanOrEqual(1);
          expect(overlap(...expandedGeometry.buttons)).toBeLessThanOrEqual(1);
          containedHorizontally(expandedGeometry.titleColumn,expandedGeometry.header);
          containedHorizontally(expandedGeometry.actions,expandedGeometry.header);
          for(const button of expandedGeometry.buttons){
            expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);
            containedHorizontally(button,expandedGeometry.actions);
          }
          const expandedSize=await focusedControl(page,'#chat-preview-size');
          await page.keyboard.press('Tab');const expandedClose=await focusedControl(page,'#chat-preview-close');
          await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
          await page.keyboard.press('Shift+Tab');await expect(sizeButton).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(sizeButton).toHaveAttribute('aria-pressed','false');await expect(panel).not.toHaveClass(/is-expanded/);
          await focusedControl(page,'#chat-preview-size');
          await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
          expanded={geometry:expandedGeometry,focus:{size:expandedSize,close:expandedClose},restoredCompact:true};
        });
        await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
        expect(await storage(page)).toEqual(before);
        observations.push({regime:name,language,geometry,focus:{size:sizeFocus,close:closeFocus},expanded});
      });
    }
    await saveEvidence('large-text-chat-headings',observations);
    await checked.verify();
  }finally{await checked.context.close();}
});

test('seven languages use available dialog width with readable order and keyboard access to every action',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  const observations=[];
  try{
    await page.goto(fixture.origin+'/');
    await page.locator('[data-subject="symbol"]').click();
    await page.locator('#subject-continue').click();
    await expect(page.locator('#chat-preview-panel')).toBeVisible();
    const subject=page.locator('#chat-preview-subject'),summary=subject.locator('summary');
    await expect(subject).toBeVisible();
    const draft='TST-layout-private-draft';await page.locator('#chat-preview-input').fill(draft);
    for(const [name,viewport,size]of [['default',surface.viewport,16],['narrow-double',{width:320,height:900},32]]){
      await page.setViewportSize(viewport);await font(page,size);
      for(const language of languages)await test.step(name+' '+language,async()=>{
        await activate(page,'.lang-btn[data-lang="'+language+'"]');const before=await storage(page);
        const subjectBefore={text:await subject.textContent(),summary:await summary.innerText(),open:await subject.getAttribute('open')};
        await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
        for(const contract of dialogs)await test.step(contract.name,async()=>{
          await activate(page,contract.trigger);const dialog=page.locator(contract.dialog);
          await expect(dialog).toBeVisible();await expect(page.locator(contract.first)).toBeFocused();
          const geometry=await dialogGeometry(page,contract);
          const expected=Math.min(contract.cap,geometry.viewport.clientWidth-32);
          expect(geometry.dialog.width).toBeGreaterThanOrEqual(expected-1);
          expect(geometry.dialog.width).toBeLessThanOrEqual(expected+1);
          expect(geometry.dialog.left).toBeGreaterThanOrEqual(15);
          expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.clientWidth-15);
          expect(geometry.dialog.height).toBeLessThanOrEqual(geometry.viewport.height-31);
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
          for(const child of [geometry.title,geometry.warning,geometry.actions,...geometry.controls])containedHorizontally(child,geometry.dialog);
          expect(geometry.title.bottom).toBeLessThanOrEqual(geometry.warning.top+1);
          expect(geometry.warning.bottom).toBeLessThanOrEqual(geometry.actions.top+1);
          expect(overlap(...geometry.controls)).toBeLessThanOrEqual(1);
          for(const control of geometry.controls){
            expect(control.width).toBeGreaterThanOrEqual(44);expect(control.height).toBeGreaterThanOrEqual(44);
            expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth+1);
          }
          await dialog.evaluate(element=>element.scrollTop=0);
          await expect(page.locator(contract.title)).toBeInViewport();
          const first=await focusedControl(page,contract.first);
          await page.keyboard.press('Tab');const second=await focusedControl(page,contract.second);
          const scroll=await dialog.evaluate(element=>({top:element.scrollTop,height:element.scrollHeight,client:element.clientHeight}));
          if(scroll.height>scroll.client+1)expect(scroll.top).toBeGreaterThan(0);
          await page.keyboard.press('Shift+Tab');await expect(page.locator(contract.first)).toBeFocused();
          await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
          await expect(page.locator(contract.restore)).toBeFocused();
          await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
          await expect(page.locator('#chat-preview-panel')).toBeVisible();
          await expect(subject).toBeVisible();
          expect(await subject.textContent()).toBe(subjectBefore.text);
          expect(await summary.innerText()).toBe(subjectBefore.summary);
          expect(await subject.getAttribute('open')).toBe(subjectBefore.open);
          expect(await storage(page)).toEqual(before);
          expect(JSON.stringify(await storage(page))).not.toContain(draft);
          observations.push({regime:name,language,kind:contract.name,geometry,focus:{first,second},scroll,
            subject:{summary:subjectBefore.summary,preserved:true}});
        });
      });
    }
    expect(checked.context.pages()).toHaveLength(1);
    await saveEvidence('large-text-dialogs',observations);
    await checked.verify();
  }finally{await checked.context.close();}
});
