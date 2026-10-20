import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const languages=['nl','en','de','fr','es','ar','zh'];
const oldMemory='TST-OUD: Mijn afspraak is dinsdag om tien uur.';
const oldQuestion='Wanneer is mijn afspraak?';
let fixture,surface;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function checkedContext(browser,options={}){
  const context=await browser.newContext({...surface,locale:'nl-NL',...options});
  const errors=[],requests=[],failures=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  context.on('requestfailed',request=>failures.push(request.url()));
  // The generated root needs only its exact local public assets. Block and
  // record foreign requests rather than contacting an external service.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin
      ?route.continue():route.abort('blockedbyclient');
  });
  return {context,requests,failures,async verify(){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET')).toEqual([]);
    expect(requests.filter(request=>new URL(request.url).pathname.startsWith('/api/'))).toEqual([]);
    expect(requests.filter(request=>/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin)).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  }};
}

async function activate(page,selector){
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
}
async function storage(page){
  return page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
    session:Object.fromEntries(Object.entries(sessionStorage))}));
}
async function remember(page,memory=oldMemory){
  await page.locator('#memory-input').fill(memory);
  await page.locator('#memory-consent').check();
  await activate(page,'#memory-form button[type="submit"]');
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
  await expect(page.locator('#memory-consent')).not.toBeChecked();
  return page.locator('#dossier-output').innerText();
}
async function ask(page,question=oldQuestion){
  await page.locator('#question-input').fill(question);
  await activate(page,'#question-form button[type="submit"]');
  await expect(page.locator('#engine-answer')).toBeVisible();
}
async function openReset(page){
  await expect(page.locator('#engine-clear')).toBeEnabled();
  await activate(page,'#engine-clear');
  const dialog=page.locator('#engine-clear-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-labelledby','engine-clear-title');
  await expect(dialog).toHaveAttribute('aria-describedby','engine-clear-warning');
  await expect(page.locator('#engine-clear-form')).toHaveAttribute('method','dialog');
  await expect(page.locator('#engine-clear-cancel')).toBeFocused();
  return dialog;
}
async function cleared(page){
  await expect(page.locator('#engine-clear-dialog')).not.toBeVisible();
  await expect(page.locator('#memory-input')).toHaveValue('');
  await expect(page.locator('#question-input')).toHaveValue('');
  await expect(page.locator('#memory-consent')).not.toBeChecked();
  await expect(page.locator('#question-input')).toBeDisabled();
  await expect(page.locator('#question-form button')).toBeDisabled();
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','CONSENT_REQUIRED');
  await expect(page.locator('#engine-answer')).toBeHidden();
  for(const selector of ['#engine-answer-state','#engine-answer-text','#engine-answer-sources']){
    await expect(page.locator(selector)).toHaveText('');
  }
}
async function clearChat(page){
  await page.locator('#chat-preview-clear').click();
  await page.locator('#chat-preview-clear-confirm').click();
  await expect(page.locator('#chat-preview-input')).toBeFocused();
  await expect(page.locator('#chat-preview-input')).toHaveValue('');
  await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(0);
  await expect(page.locator('#chat-preview-subject')).not.toBeVisible();
}
async function departure(page){
  await activate(page,'#rio-unified-reception');
  await expect(page.locator('#rio-departure-dialog')).toBeVisible();
  await expect(page.locator('#rio-departure-stay')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rio-unified-reception')).toBeFocused();
}
async function focusedCloseGeometry(page,label){
  const geometry=await page.locator('#chat-preview-close').evaluate(element=>{
    const box=element.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
    const hit=document.elementFromPoint(x,y),panel=document.querySelector('#chat-preview-panel');
    const chat=panel.getBoundingClientRect();
    return {focused:document.activeElement===element,viewport:{width:innerWidth,height:innerHeight},
      control:{id:element.id,left:box.left,top:box.top,width:box.width,height:box.height},
      centerVisible:x>=0&&x<innerWidth&&y>=0&&y<innerHeight,
      centerHitsControl:element.contains(hit),hit:hit?{id:hit.id,tag:hit.tagName,className:hit.className}:null,
      chat:{hidden:panel.hidden,left:chat.left,top:chat.top,width:chat.width,height:chat.height}};
  });
  const observation={label,project:test.info().project.name,...geometry};
  console.log('ENGINE_RESET_FOCUS_GEOMETRY '+JSON.stringify(observation));
  const path=test.info().outputPath('engine-reset-focus-'+label+'.json');
  await writeFile(path,JSON.stringify(observation,null,2)+'\n');
  await test.info().attach('engine-reset-focus-'+label,{path,contentType:'application/json'});
  expect(geometry.focused).toBe(true);expect(geometry.centerVisible).toBe(true);
  expect(geometry.centerHitsControl).toBe(true);
  expect(geometry.control.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.control.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.control.left+geometry.control.width).toBeLessThanOrEqual(geometry.viewport.width+1);
  expect(geometry.control.top+geometry.control.height).toBeLessThanOrEqual(geometry.viewport.height+1);
}

test('explicit reset clears Engine synchronously, keeps chat and subject, and cannot steal focus later',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    await remember(page);await ask(page);
    await expect(page.locator('#engine-answer-text')).toHaveText(oldMemory);
    await page.locator('#memory-input').fill('TST-next-memory-draft');
    await page.locator('#question-input').fill('TST-next-question-draft');
    await page.locator('[data-subject="symbol"]').click();
    await page.locator('#subject-continue').click();
    await page.locator('#chat-preview-input').fill('TST-sent-chat-survives');
    await page.locator('#chat-preview-send').click();
    await page.locator('#chat-preview-input').fill('TST-chat-draft-survives');
    const conversation=await page.locator('#chat-preview-messages').innerText();
    const subject=await page.locator('#chat-preview-subject').innerText();
    const before=await storage(page),requests=checked.requests.length;
    await openReset(page);
    // Observe the public controls in the same activation turn, then focus
    // another control before the native close event. Reset must already be
    // complete, and that queued event must respect the later user interaction.
    const result=await page.evaluate(async()=>{
      const dialog=document.querySelector('#engine-clear-dialog');
      const closed=new Promise(done=>dialog.addEventListener('close',done,{once:true}));
      document.querySelector('#memory-input').setCustomValidity('TST-old-memory-validity');
      document.querySelector('#question-input').setCustomValidity('TST-old-question-validity');
      document.querySelector('#engine-clear-confirm').click();
      const state={memory:document.querySelector('#memory-input').value,
        question:document.querySelector('#question-input').value,
        disabled:document.querySelector('#question-input').disabled,
        consent:document.querySelector('#memory-consent').checked,
        output:document.querySelector('#dossier-output').dataset.state,
        answerHidden:document.querySelector('#engine-answer').hidden,
        answer:['state','text','sources'].map(name=>document.querySelector('#engine-answer-'+name).textContent),
        customErrors:['memory-input','question-input'].map(id=>document.getElementById(id).validity.customError),
        focus:document.activeElement.id};
      document.querySelector('#chat-preview-input').focus();
      await closed;
      return {state,laterFocus:document.activeElement.id};
    });
    expect(result.state).toEqual({memory:'',question:'',disabled:true,consent:false,
      output:'CONSENT_REQUIRED',answerHidden:true,answer:['','',''],customErrors:[false,false],focus:'chat-preview-close'});
    expect(result.laterFocus).toBe('chat-preview-input');
    await cleared(page);
    await expect(page.locator('#chat-preview-panel')).toBeVisible();
    await expect(page.locator('#chat-preview-input')).toHaveValue('TST-chat-draft-survives');
    expect(await page.locator('#chat-preview-messages').innerText()).toBe(conversation);
    expect(await page.locator('#chat-preview-subject').innerText()).toBe(subject);
    expect(await storage(page)).toEqual(before);
    expect(checked.requests.slice(requests)).toEqual([]);
    expect(JSON.stringify(await storage(page))).not.toContain('TST-');
    await checked.verify();
  }finally{await checked.context.close();}
});

test('cancel, Escape and backdrop retain dossier, drafts, consent and chat while restoring focus',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    const dossier=await remember(page);await ask(page);
    await page.locator('#memory-input').fill('TST-uncommitted-memory');
    await page.locator('#memory-consent').check();
    await page.locator('#question-input').fill('TST-uncommitted-question');
    await page.locator('#chat-preview-toggle').click();
    await page.locator('#chat-preview-input').fill('TST-open-chat-draft');
    const before=await storage(page);
    for(const action of ['cancel','escape','backdrop']){
      const dialog=await openReset(page);
      if(action==='cancel')await page.locator('#engine-clear-cancel').click();
      else if(action==='escape')await page.keyboard.press('Escape');
      else{
        const box=await dialog.boundingBox();
        expect(box.y).toBeGreaterThan(2);
        await page.mouse.click(2,2);
      }
      await expect(dialog).not.toBeVisible();
      await expect(page.locator('#chat-preview-close')).toBeFocused();
      await expect(page.locator('#dossier-output')).toHaveText(dossier);
      await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
      await expect(page.locator('#engine-answer-text')).toHaveText(oldMemory);
      await expect(page.locator('#memory-input')).toHaveValue('TST-uncommitted-memory');
      await expect(page.locator('#question-input')).toHaveValue('TST-uncommitted-question');
      await expect(page.locator('#memory-consent')).toBeChecked();
      await expect(page.locator('#chat-preview-panel')).toBeVisible();
      await expect(page.locator('#chat-preview-input')).toHaveValue('TST-open-chat-draft');
      expect(await storage(page)).toEqual(before);
    }
    await checked.verify();
  }finally{await checked.context.close();}
});

test('replacement and reset require fresh consented dossiers whose answers cannot recover earlier memories',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    const oldDossier=await remember(page);await ask(page);
    await expect(page.locator('#engine-answer-text')).toHaveText(oldMemory);
    // Exercise a successful A -> B replacement through the real forms before
    // clearing B. The core unit tests separately check held-snapshot disposal;
    // this browser case makes only claims visible to the participant.
    const replacementMemory='TST-TUSSEN: De reserveparaplu is paars.';
    const replacementQuestion='Waar is de reserveparaplu?';
    const replacementDossier=await remember(page,replacementMemory);
    expect(replacementDossier).not.toBe(oldDossier);
    await expect(page.locator('#engine-answer')).toBeHidden();
    await expect(page.locator('#engine-answer-state')).toHaveText('');
    await expect(page.locator('#engine-answer-text')).toHaveText('');
    await expect(page.locator('#engine-answer-sources')).toHaveText('');
    await ask(page,oldQuestion);
    await expect(page.locator('#engine-answer-state')).toHaveText('ONVOLDOENDE BEWIJS');
    await expect(page.locator('#engine-answer-text')).not.toContainText(oldMemory);
    await ask(page,replacementQuestion);
    await expect(page.locator('#engine-answer-text')).toHaveText(replacementMemory);
    await openReset(page);await page.locator('#engine-clear-confirm').click();
    await cleared(page);await expect(page.locator('#memory-input')).toBeFocused();
    const freshMemory='TST-NIEUW: De kleur van de fiets is groen.';
    await page.locator('#memory-input').fill(freshMemory);
    // A previous confirmation must never survive a later opening as an
    // implicit confirmation when the user presses Escape instead.
    await openReset(page);await page.keyboard.press('Escape');
    await expect(page.locator('#engine-clear')).toBeFocused();
    await expect(page.locator('#memory-input')).toHaveValue(freshMemory);
    await expect(page.locator('#question-input')).toBeDisabled();
    await activate(page,'#memory-form button[type="submit"]');
    await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','CONSENT_REQUIRED');
    await expect(page.locator('#question-input')).toBeDisabled();
    const freshDossier=await remember(page,freshMemory);
    expect(freshDossier).not.toBe(oldDossier);
    expect(freshDossier).not.toBe(replacementDossier);
    await ask(page,oldQuestion);
    await expect(page.locator('#engine-answer-state')).toHaveText('ONVOLDOENDE BEWIJS');
    await expect(page.locator('#engine-answer-text')).not.toContainText(oldMemory);
    await expect(page.locator('#engine-answer-sources')).toHaveText('—');
    await ask(page,replacementQuestion);
    await expect(page.locator('#engine-answer-state')).toHaveText('ONVOLDOENDE BEWIJS');
    await expect(page.locator('#engine-answer-text')).not.toContainText(replacementMemory);
    await ask(page,'Welke kleur heeft de fiets?');
    await expect(page.locator('#engine-answer-state')).toHaveText('ANTWOORD MET BEWIJS');
    await expect(page.locator('#engine-answer-text')).toHaveText(freshMemory);
    const saved=JSON.stringify(await storage(page));
    expect(saved).not.toContain(oldMemory);expect(saved).not.toContain(replacementMemory);expect(saved).not.toContain(freshMemory);
    expect(JSON.stringify(checked.requests)).not.toContain('TST-');
    await checked.verify();
  }finally{await checked.context.close();}
});

test('Engine reset releases its departure gate while remaining chat work still receives a safe choice',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    await page.locator('#memory-input').fill('TST-only-Engine-draft');
    await departure(page);
    await openReset(page);await page.locator('#engine-clear-confirm').click();
    await cleared(page);await expect(page.locator('#memory-input')).toBeFocused();
    await activate(page,'#rio-unified-reception');
    await expect(page).toHaveURL(fixture.origin+'/rio/reception/#nova-explained:nl');
    await page.goto(fixture.origin+'/');
    await remember(page);
    await page.locator('#chat-preview-toggle').click();
    await page.locator('#chat-preview-input').fill('TST-chat-still-needs-choice');
    await openReset(page);await activate(page,'#engine-clear-confirm');
    await cleared(page);
    await expect(page.locator('#chat-preview-close')).toBeFocused();
    await focusedCloseGeometry(page,'open-chat-standard-text');
    await departure(page);
    await expect(page.locator('#chat-preview-input')).toHaveValue('TST-chat-still-needs-choice');
    await clearChat(page);
    await activate(page,'#rio-unified-reception');
    await expect(page).toHaveURL(fixture.origin+'/rio/reception/#nova-explained:nl');
    await checked.verify();
  }finally{await checked.context.close();}
});

test('seven translated reset choices remain readable and keyboard operable at 320 pixels with doubled text',async({browser})=>{
  const checked=await checkedContext(browser,{viewport:{width:320,height:844}}),page=await checked.context.newPage();
  try{
    const titles=new Set(),confirmations=new Set();
    await page.goto(fixture.origin+'/');
    await page.addStyleTag({content:'html, body {font-size:32px !important}'});
    const firstConsentMessage=await page.locator('#dossier-output').innerText();
    for(const language of languages){
      await test.step('language '+language,async()=>{
        await activate(page,'.lang-btn[data-lang="'+language+'"]');
        const draft='TST-matrix-draft-'+language;
        await page.locator('#memory-input').fill(draft);
        if(language==='nl')await page.locator('#chat-preview-toggle').click();
        const before=await storage(page);
        const dialog=await openReset(page);
        titles.add((await page.locator('#engine-clear-title').innerText()).trim());
        await expect(page.locator('#engine-clear-title')).not.toHaveText('');
        await expect(page.locator('#engine-clear-warning')).not.toHaveText('');
        await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
        for(const selector of ['#engine-clear','#engine-clear-cancel','#engine-clear-confirm']){
          const size=await page.locator(selector).evaluate(element=>{
            const box=element.getBoundingClientRect();
            return {width:box.width,height:box.height,scroll:element.scrollWidth,client:element.clientWidth};
          });
          expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44);
          expect(size.scroll).toBeLessThanOrEqual(size.client+1);
        }
        const bounds=await dialog.evaluate(element=>{
          const box=element.getBoundingClientRect();
          return {left:box.left,right:box.right,viewport:innerWidth,scroll:element.scrollWidth,client:element.clientWidth};
        });
        expect(bounds.left).toBeGreaterThanOrEqual(-1);expect(bounds.right).toBeLessThanOrEqual(bounds.viewport+1);
        expect(bounds.scroll).toBeLessThanOrEqual(bounds.client+1);
        await page.keyboard.press('Tab');await expect(page.locator('#engine-clear-confirm')).toBeFocused();
        await page.keyboard.press('Shift+Tab');await expect(page.locator('#engine-clear-cancel')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator(language==='nl'?'#chat-preview-close':'#engine-clear')).toBeFocused();
        await expect(page.locator('#memory-input')).toHaveValue(draft);
        await openReset(page);await activate(page,'#engine-clear-confirm');
        await cleared(page);
        await expect(page.locator(language==='nl'?'#chat-preview-close':'#memory-input')).toBeFocused();
        if(language==='nl')await focusedCloseGeometry(page,'open-chat-320-double-text');
        const confirmation=await page.locator('#dossier-output').innerText();
        if(language==='nl')expect(confirmation).not.toBe(firstConsentMessage);
        expect(confirmation.trim()).not.toBe('');confirmations.add(confirmation);
        expect(await storage(page)).toEqual(before);
        expect(JSON.stringify(await storage(page))).not.toContain(draft);
        if(language==='nl')await page.locator('#chat-preview-close').click();
        const next=languages[(languages.indexOf(language)+1)%languages.length];
        await activate(page,'.lang-btn[data-lang="'+next+'"]');
        await expect(page.locator('html')).toHaveAttribute('lang',next);
        await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','CONSENT_REQUIRED');
        const translated=await page.locator('#dossier-output').innerText();
        expect(translated.trim()).not.toBe('');expect(translated).not.toBe(confirmation);
        expect(translated).not.toMatch(/rio:dossier:/);
        await expect(page.locator('#question-input')).toBeDisabled();
      });
    }
    expect(titles.size).toBe(languages.length);expect(confirmations.size).toBe(languages.length);
    await checked.verify();
    const noScript=await checkedContext(browser,{javaScriptEnabled:false});
    try{
      const fallback=await noScript.context.newPage();await fallback.goto(fixture.origin+'/');
      await expect(fallback.locator('#engine-clear')).toBeDisabled();
      await expect(fallback.locator('#engine-clear-dialog')).not.toBeVisible();
      await noScript.verify();
    }finally{await noScript.context.close();}
  }finally{await checked.context.close();}
});

test('the actual cached root can reset an offline Engine without clearing its temporary chat or making a request',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage();
  try{
    await page.goto(fixture.origin+'/');
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
    await checked.context.setOffline(true);
    const response=await page.reload();
    expect(response.fromServiceWorker()).toBe(true);
    await remember(page);await ask(page);
    await expect(page.locator('#engine-answer-text')).toHaveText(oldMemory);
    await page.locator('#chat-preview-toggle').click();
    await page.locator('#chat-preview-input').fill('TST-offline-chat-survives');
    await page.locator('#chat-preview-send').click();
    const conversation=await page.locator('#chat-preview-messages').innerText();
    const before=await storage(page),requests=checked.requests.length,failures=checked.failures.length;
    await openReset(page);await page.locator('#engine-clear-confirm').click();
    await cleared(page);await expect(page.locator('#chat-preview-close')).toBeFocused();
    expect(await page.locator('#chat-preview-messages').innerText()).toBe(conversation);
    await expect(page.locator('#chat-preview-messages .is-visitor')).toHaveCount(1);
    await expect(page.locator('#chat-preview-panel')).toBeVisible();
    expect(await storage(page)).toEqual(before);
    expect(checked.requests.slice(requests)).toEqual([]);
    expect(checked.failures.slice(failures)).toEqual([]);
    await checked.verify();
  }finally{await checked.context.close();}
});
