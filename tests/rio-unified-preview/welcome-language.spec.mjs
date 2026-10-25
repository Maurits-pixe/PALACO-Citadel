import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const welcomes={
  nl:'Hallo! Ik ben RIO. Stel gerust een vraag over RIO of deze preview.',
  en:"Hello! I'm RIO. Ask me about RIO or this preview.",
  de:'Hallo! Ich bin RIO. Frag mich gern zu RIO oder dieser Vorschau.',
  fr:'Bonjour ! Je suis RIO. Posez-moi une question sur RIO ou cet aperçu.',
  es:'¡Hola! Soy RIO. Pregúntame sobre RIO o esta vista previa.',
  pt:'Olá! Sou RIO. Pergunte sobre o RIO ou esta prévia.',
  ru:'Здравствуйте! Я RIO. Задайте вопрос о RIO или этом предпросмотре.',
  eo:'Saluton! Mi estas RIO. Demandu pri RIO aŭ ĉi tiu antaŭrigardo.',
  pl:'Cześć! Jestem RIO. Zapytaj o RIO lub ten podgląd.',
  ar:'مرحباً! أنا RIO. يمكنك سؤالي عن RIO أو هذه المعاينة.',
  zh:'你好！我是 RIO。你可以询问关于 RIO 或此预览的问题。',
};
const languages=Object.keys(welcomes);
let fixture,surface,source;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['chat-preview.mjs','app.js','index.html'])
    source[file+'Sha256']=createHash('sha256').update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function checkedContext(browser){
  const context=await browser.newContext({...surface,locale:'en-US'}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin
      ?route.continue():route.abort('blockedbyclient');
  });
  return {context,async verify(page,language,privateText=[]){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null
      ||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    const stored=await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
      session:Object.fromEntries(Object.entries(sessionStorage))}));
    expect(stored).toEqual({local:{},session:language?{'palaco-language':language}:{}});
    for(const text of privateText){
      expect(JSON.stringify(stored)).not.toContain(text);
      for(const request of requests)expect(decodeURIComponent(request.url)).not.toContain(text);
    }
    expect(context.pages()).toHaveLength(1);
  }};
}
async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function saveEvidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-welcome-language/1',project:test.info().project.name,source,observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}
async function snapshot(page){
  return page.evaluate(()=>{
    const log=document.querySelector('#chat-preview-messages'),panel=document.querySelector('#chat-preview-panel');
    const first=log.firstElementChild,body=first?.querySelector('p');
    return {language:document.documentElement.lang,dir:document.documentElement.dir,
      active:{id:document.activeElement?.id,language:document.activeElement?.dataset.lang},
      hidden:panel.hidden,expanded:panel.classList.contains('is-expanded'),count:log.childElementCount,
      visitorCount:log.querySelectorAll('.is-visitor').length,
      welcome:{text:body?.textContent,author:first?.querySelector('strong')?.textContent,
        itemLanguage:first?.lang,itemDir:first?.dir,bodyLanguage:body?.lang,bodyDir:body?.dir},
      live:{role:log.getAttribute('role'),live:log.getAttribute('aria-live'),relevant:log.getAttribute('aria-relevant')},
      status:document.querySelector('#chat-preview-status').textContent,
      scroll:{panelTop:panel.scrollTop,panelLeft:panel.scrollLeft,logTop:log.scrollTop,logLeft:log.scrollLeft},
      history:[...log.children].map(item=>item.outerHTML)};
  });
}
async function switchLanguage(page,language,observations){
  const selector='.lang-btn[data-lang="'+language+'"]';
  await page.locator(selector).focus();const before=await snapshot(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  // Observe the next rendering opportunity, including queued native close/focus work.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  const after=await snapshot(page);observations.push({action:'language',language,before,after});
  await expect(page.locator(selector)).toBeFocused();
  expect(after.dir).toBe(language==='ar'?'rtl':'ltr');
  expect(after.hidden).toBe(before.hidden);expect(after.expanded).toBe(before.expanded);
  expect(after.live).toEqual({role:'log',live:'polite',relevant:'additions'});
  expect(after.status).toBe('');
  // A following real control remains the focus owner after language handling.
  const nextControl=after.hidden?'#chat-preview-toggle':'#chat-preview-input';
  await page.locator(nextControl).focus();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  await expect(page.locator(nextControl)).toBeFocused();
  return after;
}
async function expectWelcome(page,language,original,observations){
  const current=await snapshot(page),sameNode=await original.evaluate(element=>element===document.querySelector('#chat-preview-messages').firstElementChild);
  observations.push({action:'welcome',expectedLanguage:language,sameNode,observed:current});
  expect(current.count).toBe(1);expect(current.visitorCount).toBe(0);expect(sameNode).toBe(true);
  expect(current.welcome).toEqual({text:welcomes[language],author:'RIO',itemLanguage:language,
    itemDir:language==='ar'?'rtl':'ltr',bodyLanguage:language,bodyDir:language==='ar'?'rtl':'ltr'});
  await expect(page.locator('#chat-preview-reading')).not.toBeVisible();
}
async function chooseSubject(page){
  await activate(page,'[data-subject="elixer"]');await expect(page.locator('#subject-dialog')).toBeVisible();
  const identity=await subjectIdentity(page);
  await activate(page,'#subject-continue');
  await expect(page.locator('#chat-preview-panel')).toBeVisible();
  await page.locator('#chat-preview-subject summary').click();
  await page.locator('#chat-preview-followups summary').click();
  return identity;
}
async function subjectIdentity(page){
  return page.locator('#subject-dialog').evaluate(dialog=>Object.fromEntries(
    ['subjectId','subjectType','subjectState','provenanceReference','objectReference','presentationEffect'].map(key=>[key,dialog.dataset[key]])));
}
async function expectSubject(page,identity){
  expect(await subjectIdentity(page)).toEqual(identity);
  await expect(page.locator('#chat-preview-subject')).toBeVisible();
  await expect(page.locator('#chat-preview-subject')).toHaveAttribute('open','');
  await expect(page.locator('#chat-preview-followups')).toHaveAttribute('open','');
  for(const [chat,dialog]of [['title','title'],['description','description'],['source','source'],['state','status']]){
    const expected=await page.locator('#subject-dialog-'+dialog).textContent();expect(expected.trim().length).toBeGreaterThan(0);
    await expect(page.locator('#chat-preview-subject-'+chat)).toHaveText(expected);
  }
  expect(await page.locator('[data-chat-followup]').evaluateAll(buttons=>buttons.map(button=>button.dataset.chatFollowup)))
    .toEqual(['candidate','personas','evidence']);
  for(const button of await page.locator('[data-chat-followup]').all())expect((await button.textContent()).trim().length).toBeGreaterThan(0);
}
async function expectHistory(page,history,handles){
  expect(await page.locator('#chat-preview-messages > li').evaluateAll(items=>items.map(item=>item.outerHTML))).toEqual(history);
  for(const [index,handle]of handles.entries())expect(await handle.evaluate((element,index)=>
    element===document.querySelector('#chat-preview-messages').children[index],index)).toBe(true);
}

test('one unsent welcome follows all eleven explicit languages in place while preserving draft and subject',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  const draft='TST-unsent-welcome-draft مرحبا <b>literal</b>';
  try{
    await page.goto(fixture.origin+'/');await activate(page,'#chat-preview-toggle');
    const welcome=await page.locator('#chat-preview-messages > li').elementHandle();
    await expectWelcome(page,'en',welcome,observations);
    const identity=await chooseSubject(page);await page.locator('#chat-preview-input').fill(draft);
    await activate(page,'#chat-preview-size');await expect(page.locator('#chat-preview-size')).toHaveAttribute('aria-pressed','true');
    for(const language of languages)await test.step('unsent welcome '+language,async()=>{
      await switchLanguage(page,language,observations);await expectWelcome(page,language,welcome,observations);
      await expect(page.locator('#chat-preview-input')).toHaveValue(draft);await expectSubject(page,identity);
      await checked.verify(page,language,[draft]);
    });
    // Closing the panel does not turn its welcome into history or discard its work.
    await activate(page,'#chat-preview-close');await switchLanguage(page,'nl',observations);
    await expect(page.locator('#chat-preview-panel')).not.toBeVisible();await expectWelcome(page,'nl',welcome,observations);
    await activate(page,'#chat-preview-toggle');await expectSubject(page,identity);
    await expect(page.locator('#chat-preview-input')).toHaveValue(draft);await checked.verify(page,'nl',[draft]);
  }finally{
    try{await saveEvidence('unsent-welcome-language',observations);}finally{await checked.context.close();}
  }
});

test('saved language starts the welcome while sent history stays intact until explicit clear makes it fresh again',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  const sent='TST-sent-history مرحبا <b>literal</b>',draft='TST-history-draft retains my words';
  try{
    await page.goto(fixture.origin+'/');await activate(page,'.lang-btn[data-lang="es"]');await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang','es');await activate(page,'#chat-preview-toggle');
    const initialWelcome=await page.locator('#chat-preview-messages > li').elementHandle();
    await expectWelcome(page,'es',initialWelcome,observations);
    const identity=await chooseSubject(page);
    await page.locator('#chat-preview-input').fill(sent);await activate(page,'#chat-preview-send');
    await expect(page.locator('#chat-preview-messages .is-visitor > p')).toHaveText(sent);
    await expect(page.locator('#chat-preview-messages .is-visitor > p')).toHaveAttribute('dir','auto');
    await expect(page.locator('#chat-preview-messages .is-visitor > p')).toHaveAttribute('lang','');
    await page.locator('#chat-preview-input').fill(draft);
    const history=await page.locator('#chat-preview-messages > li').evaluateAll(items=>items.map(item=>item.outerHTML));
    const handles=await page.locator('#chat-preview-messages > li').elementHandles();
    for(const language of languages)await test.step('sent history '+language,async()=>{
      await switchLanguage(page,language,observations);await expectHistory(page,history,handles);
      await expect(page.locator('#chat-preview-input')).toHaveValue(draft);await expectSubject(page,identity);
      await checked.verify(page,language,[sent,draft]);
    });
    // A new subject answer uses current copy without rewriting the earlier Spanish transcript.
    const description=await page.locator('#chat-preview-subject-description').textContent();
    await activate(page,'[data-chat-prompt="subject"]');
    await expect(page.locator('#chat-preview-messages > li')).toHaveCount(history.length+2);
    const latest=page.locator('#chat-preview-messages > li').last();
    await expect(latest).toHaveAttribute('lang','zh');await expect(latest.locator('p')).toHaveAttribute('lang','zh');
    await expect(latest.locator('p')).toContainText(description);await expect(page.locator('#chat-preview-input')).toHaveValue(draft);
    for(const [index,html]of history.entries())expect(await page.locator('#chat-preview-messages > li').nth(index).evaluate(item=>item.outerHTML)).toBe(html);
    const beforeClear=await snapshot(page);
    await activate(page,'#chat-preview-clear');await expect(page.locator('#chat-preview-clear-cancel')).toBeFocused();
    await page.keyboard.press('Escape');await expect(page.locator('#chat-preview-clear-dialog')).not.toBeVisible();
    await expect(page.locator('#chat-preview-clear')).toBeFocused();
    expect((await snapshot(page)).history).toEqual(beforeClear.history);
    await expect(page.locator('#chat-preview-input')).toHaveValue(draft);await expectSubject(page,identity);
    await activate(page,'#chat-preview-clear');await activate(page,'#chat-preview-clear-confirm');
    await expect(page.locator('#chat-preview-input')).toBeFocused();
    await expect(page.locator('#chat-preview-input')).toHaveValue('');
    await expect(page.locator('#chat-preview-subject')).not.toBeVisible();
    const clearedWelcome=await page.locator('#chat-preview-messages > li').elementHandle();
    expect(await initialWelcome.evaluate(element=>element.isConnected)).toBe(false);
    await expectWelcome(page,'zh',clearedWelcome,observations);
    await switchLanguage(page,'ar',observations);await expectWelcome(page,'ar',clearedWelcome,observations);
    await checked.verify(page,'ar',[sent,draft]);
    // Each public send entry point starts immutable history, including when it is the first send.
    for(const [kind,nextLanguage]of [['about','nl'],['subject-question','fr']])await test.step('first '+kind+' preserves history',async()=>{
      await activate(page,'#chat-preview-clear');await activate(page,'#chat-preview-clear-confirm');
      await expect(page.locator('#chat-preview-input')).toBeFocused();
      await expect(page.locator('#chat-preview-messages > li')).toHaveCount(1);
      const sendingLanguage=await page.locator('html').getAttribute('lang');
      if(kind==='about')await activate(page,'[data-chat-prompt="about"]');
      else{await chooseSubject(page);await activate(page,'[data-chat-followup="candidate"]');}
      await expect(page.locator('#chat-preview-messages > li')).toHaveCount(3);
      await expect(page.locator('#chat-preview-messages .is-visitor > p')).toHaveAttribute('lang',sendingLanguage);
      const presetHistory=await page.locator('#chat-preview-messages > li').evaluateAll(items=>items.map(item=>item.outerHTML));
      const presetHandles=await page.locator('#chat-preview-messages > li').elementHandles();
      await switchLanguage(page,nextLanguage,observations);await expectHistory(page,presetHistory,presetHandles);
      observations.push({action:'first-send-history',kind,sendingLanguage,nextLanguage,history:presetHistory,preserved:true});
      await checked.verify(page,nextLanguage,[sent,draft]);
    });
  }finally{
    try{await saveEvidence('history-welcome-language',observations);}finally{await checked.context.close();}
  }
});
