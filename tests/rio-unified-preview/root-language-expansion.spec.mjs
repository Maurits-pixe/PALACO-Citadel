import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const copy={
  it:{name:'Italiano',locale:'it-IT',nova:'Chi è NOVA?',welcome:'Ciao! Sono RIO. Fammi una domanda su RIO o su questa anteprima.',
    fallback:'In questa anteprima posso solo spiegare RIO e come viene gestita questa conversazione. Prova una delle domande di esempio.',
    clearChat:'Cancellare questa conversazione?',clearEngine:'Svuotare questo esercizio?',departure:'Stai ancora lavorando qui.',
    insufficient:'PROVE INSUFFICIENTI',abstention:'RIO non ha prove sufficienti in questo dossier per rispondere a questa domanda.'},
  pt:{name:'Português',locale:'pt-BR',nova:'Quem é a NOVA?',welcome:'Olá! Sou RIO. Pergunte sobre o RIO ou esta prévia.',
    fallback:'Nesta prévia só posso explicar o RIO e como esta conversa é tratada. Experimente uma das perguntas sugeridas.',
    clearChat:'Apagar esta conversa?',clearEngine:'Esvaziar este exercício?',departure:'Ainda está a trabalhar aqui.',
    insufficient:'PROVAS INSUFICIENTES',abstention:'O RIO não tem provas suficientes neste dossier para responder a esta pergunta.'},
  ru:{name:'Русский',locale:'ru-RU',nova:'Кто такая NOVA?',welcome:'Здравствуйте! Я RIO. Задайте вопрос о RIO или этом предпросмотре.',
    fallback:'В этом предпросмотре я могу только рассказать о RIO и о том, как обрабатывается разговор. Попробуйте один из предложенных вопросов.',
    clearChat:'Очистить этот разговор?',clearEngine:'Очистить это упражнение?',departure:'Вы ещё работаете здесь.',
    insufficient:'НЕДОСТАТОЧНО ДОКАЗАТЕЛЬСТВ',abstention:'В этом досье у RIO недостаточно доказательств, чтобы ответить на этот вопрос.'},
  eo:{name:'Esperanto',locale:'eo',nova:'Kiu estas NOVA?',welcome:'Saluton! Mi estas RIO. Demandu pri RIO aŭ ĉi tiu antaŭrigardo.',
    fallback:'En ĉi tiu antaŭrigardo mi povas nur klarigi RIO kaj la traktadon de ĉi tiu konversacio. Provu unu el la proponitaj demandoj.',
    clearChat:'Ĉu forviŝi ĉi tiun konversacion?',clearEngine:'Ĉu malplenigi ĉi tiun ekzercon?',departure:'Vi ankoraŭ laboras ĉi tie.',
    insufficient:'NESUFIĈA PRUVO',abstention:'RIO ne havas sufiĉan pruvon en ĉi tiu dosiero por respondi ĉi tiun demandon.'},
  pl:{name:'Polski',locale:'pl-PL',nova:'Kim jest NOVA?',welcome:'Cześć! Jestem RIO. Zapytaj o RIO lub ten podgląd.',
    fallback:'W tym podglądzie mogę jedynie wyjaśnić, czym jest RIO i jak obsługiwana jest ta rozmowa. Wypróbuj jedno z proponowanych pytań.',
    clearChat:'Wyczyścić tę rozmowę?',clearEngine:'Wyczyścić to ćwiczenie?',departure:'Nadal tutaj pracujesz.',
    insufficient:'NIEWYSTARCZAJĄCE DOWODY',abstention:'RIO nie ma w tym dossier wystarczających dowodów, aby odpowiedzieć na to pytanie.'},
};
const languages=Object.keys(copy),privateText='TST-language-expansion-private-memory';
let fixture,surface,source;
test.beforeEach(async({},info)=>{const use=info.project.use;surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['app.js','chat-preview.mjs','rio-engine-web.mjs','integration.mjs','rio/start.js','rio/reception/app.js'])
    source[file+'Sha256']=createHash('sha256').update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});
async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function selected(page,language){
  await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('html')).toHaveAttribute('dir','ltr');
}
async function checkedContext(browser,options={}){
  const context=await browser.newContext({...surface,locale:'en-US',...options}),errors=[],requests=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin?route.continue():route.abort('blockedbyclient');
  });
  return {context,requests,async verify(){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    for(const request of requests)expect(decodeURIComponent(request.url)).not.toContain(privateText);
    expect(await context.cookies()).toEqual([]);expect(context.pages()).toHaveLength(1);
  }};
}
async function evidence(name,observations){
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify({schema:'rio-root-language-expansion/1',project:test.info().project.name,source,
    observedAtUtc:new Date().toISOString(),observations},null,2)+'\n');
  await test.info().attach(name,{path,contentType:'application/json'});
}
async function nova(page,language){
  await expect(page).toHaveURL(fixture.origin+'/rio/reception/#nova-explained:'+language);
  await expect(page.locator('#nova-language')).toHaveValue(language);
  await expect(page.locator('#nova-explained')).toHaveAttribute('lang',language);
  await expect(page.locator('#nova-explained-title')).toHaveText(copy[language].nova);
  await expect(page.locator('#nova-explained')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang','nl');
  await expect(page.locator('#runtime-nova')).toHaveAttribute('data-state','unconfirmed');
  await expect(page.locator('#refresh-availability')).toBeDisabled();
  expect(new URL(page.url()).search).toBe('');
}

test('Italian Portuguese Russian Esperanto and Polish follow explicit root NOVA and app routes without losing the saved choice',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    for(const language of languages){
      await page.goto(fixture.origin+'/');await expect(page.locator('.lang-btn')).toHaveCount(12);
      const button=page.locator('.lang-btn[data-lang="'+language+'"]');
      await expect(button).toHaveAttribute('lang',language);await expect(button).toHaveAccessibleName(copy[language].name);
      await activate(page,'.lang-btn[data-lang="'+language+'"]');await selected(page,language);
      await page.reload();await selected(page,language);
      await expect(page.locator('#rio-unified-reception')).toHaveAttribute('href','/rio/reception/#nova-explained:'+language);
      await activate(page,'#rio-unified-reception');await nova(page,language);
      // NOVA explains a temporary choice without replacing the tab's explicit
      // root/app preference. Returning through its real brand link keeps it.
      const temporaryNova=language==='it'?'en':'it';
      await page.locator('#nova-language').selectOption(temporaryNova);
      await expect(page.locator('#nova-explained')).toHaveAttribute('lang',temporaryNova);
      await activate(page,'a.brand[href="/"]');await selected(page,language);
      expect(await page.evaluate(()=>sessionStorage.getItem('palaco-language'))).toBe(language);
      await activate(page,'#rio-unified-offline');await selected(page,language);
      await expect(page.locator('#language option')).toHaveCount(12);
      await page.reload();await selected(page,language);
      await expect(page.locator('#unified-reception')).toHaveAttribute('href','/rio/reception/#nova-explained:'+language);
      await activate(page,'#unified-home');await selected(page,language);
      expect(await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))})))
        .toEqual({local:{},session:{'palaco-language':language}});
      observations.push({language,root:language,nova:language,temporaryNova,app:language,persisted:language});
    }
    await checked.verify();await evidence('expanded-route-continuity',observations);
  }finally{await checked.context.close();}
});

test('new root browser-language fallbacks and explicit routes stay usable when storage is denied or full',async({browser})=>{
  const observations=[];
  for(const mode of ['blocked','quota'])for(const language of languages){
    const checked=await checkedContext(browser,{locale:copy[language].locale}),page=await checked.context.newPage();
    try{
      await checked.context.addInitScript(mode=>{
        if(mode==='blocked')for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('Synthetic blocked storage','SecurityError');}});
        else Storage.prototype.setItem=function(){throw new DOMException('Synthetic full storage','QuotaExceededError');};
      },mode);
      await page.goto(fixture.origin+'/');await selected(page,language);
      await activate(page,'.lang-btn[data-lang="en"]');await selected(page,'en');
      await activate(page,'.lang-btn[data-lang="'+language+'"]');await selected(page,language);
      await activate(page,'#rio-unified-reception');await nova(page,language);
      await activate(page,'a.brand[href="/"]');await selected(page,language);
      // The app has an explicit public query contract. With unavailable tab
      // storage, use that contract rather than claiming silent persistence.
      await page.goto(fixture.origin+'/rio/?lang='+language);await selected(page,language);
      await page.reload();await selected(page,language);
      await activate(page,'#unified-reception');await nova(page,language);
      await checked.verify();observations.push({mode,language,browserLocale:copy[language].locale,explicitAppQuery:language});
    }finally{await checked.context.close();}
  }
  await evidence('expanded-language-storage-denial',observations);
});

test('the genuinely offline root and app preserve new languages while chat Engine and exit choices use localized boundaries',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  try{
    await page.goto(fixture.origin+'/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
    await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toBe(fixture.origin+'/sw.js');
    await activate(page,'#rio-unified-offline');await expect(page).toHaveURL(fixture.origin+'/rio/');
    await page.waitForLoadState('load');
    await expect.poll(()=>page.evaluate(async()=>(await navigator.serviceWorker.getRegistration(location.origin+'/rio/'))?.active?.scriptURL)).toBe(fixture.origin+'/rio/sw.js');
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toBe(fixture.origin+'/rio/sw.js');
    await activate(page,'#unified-home');await expect(page).toHaveURL(fixture.origin+'/');
    await checked.context.setOffline(true);
    const rootReload=await page.reload();expect(rootReload.fromServiceWorker()).toBe(true);
    for(const language of languages){
      await activate(page,'.lang-btn[data-lang="'+language+'"]');await selected(page,language);
      await activate(page,'#chat-preview-toggle');
      await expect(page.locator('#chat-preview-messages > li')).toHaveCount(1);
      await expect(page.locator('#chat-preview-messages > li p')).toHaveText(copy[language].welcome);
      await page.locator('#chat-preview-input').fill('TST-unrecognized-topic Ω');await activate(page,'#chat-preview-send');
      await expect(page.locator('#chat-preview-messages > li').last().locator('p')).toHaveText(copy[language].fallback);
      await expect(page.locator('#chat-preview-messages > li').last()).toHaveAttribute('lang',language);
      const privacyQuestion=await page.locator('[data-chat-prompt="privacy"]').textContent();
      await page.locator('#chat-preview-input').fill(privacyQuestion.toUpperCase());
      await activate(page,'#chat-preview-send');
      const privacyAnswer=await page.locator('#chat-preview-messages > li').last().locator('p').textContent();
      expect(privacyAnswer).not.toBe(copy[language].fallback);
      await activate(page,'[data-chat-prompt="privacy"]');
      await expect(page.locator('#chat-preview-messages > li').last().locator('p')).toHaveText(privacyAnswer);
      const remembered=language==='it'?privateText+' · Il mio appuntamento è martedì alle dieci.':privateText;
      await page.locator('#memory-input').fill(remembered);await page.locator('#memory-consent').check();
      await activate(page,'#memory-form button[type="submit"]');await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
      if(language==='it'){
        await page.locator('#question-input').fill('Quando è il mio appuntamento?');await activate(page,'#question-form button[type="submit"]');
        await expect(page.locator('#engine-answer-state')).toHaveText('RISPOSTA CON PROVE');
        await expect(page.locator('#engine-answer-text')).toHaveText(remembered);
        await page.locator('#question-input').fill('Qual è il mio saldo?');await activate(page,'#question-form button[type="submit"]');
        await expect(page.locator('#engine-answer-state')).toHaveText(copy[language].insufficient);
        await expect(page.locator('#engine-answer-text')).toHaveText(copy[language].abstention);
      }
      await page.locator('#question-input').fill('Welke vulkanen staan op Venus?');await activate(page,'#question-form button[type="submit"]');
      await expect(page.locator('#engine-answer-state')).toHaveText(copy[language].insufficient);
      await expect(page.locator('#engine-answer-text')).toHaveText(copy[language].abstention);
      await expect(page.locator('#engine-answer-text')).toHaveAttribute('lang',language);
      const history=await page.locator('#chat-preview-messages').innerHTML();
      await activate(page,'#rio-unified-reception');
      await expect(page.locator('#rio-departure-title')).toHaveText(copy[language].departure);
      await expect(page.locator('#rio-departure-new-tab')).toHaveAttribute('href',fixture.origin+'/rio/reception/#nova-explained:'+language);
      await page.keyboard.press('Escape');await expect(page.locator('#rio-unified-reception')).toBeFocused();
      await activate(page,'#engine-clear');await expect(page.locator('#engine-clear-title')).toHaveText(copy[language].clearEngine);
      await activate(page,'#engine-clear-confirm');await expect(page.locator('#engine-answer')).not.toBeVisible();
      expect(await page.locator('#chat-preview-messages').innerHTML()).toBe(history);
      await activate(page,'#chat-preview-clear');await expect(page.locator('#chat-preview-clear-title')).toHaveText(copy[language].clearChat);
      await page.keyboard.press('Escape');expect(await page.locator('#chat-preview-messages').innerHTML()).toBe(history);
      await activate(page,'#chat-preview-clear');await activate(page,'#chat-preview-clear-confirm');
      await expect(page.locator('#chat-preview-messages > li')).toHaveCount(1);
      await expect(page.locator('#chat-preview-messages > li p')).toHaveText(copy[language].welcome);
      await activate(page,'#chat-preview-close');await activate(page,'#rio-unified-offline');
      await expect(page).toHaveURL(fixture.origin+'/rio/');await selected(page,language);
      const appReload=await page.reload();expect(appReload.fromServiceWorker()).toBe(true);await selected(page,language);
      await activate(page,'#unified-home');await expect(page).toHaveURL(fixture.origin+'/');await selected(page,language);
      expect(await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))})))
        .toEqual({local:{},session:{'palaco-language':language}});
      observations.push({language,rootOffline:true,appOffline:appReload.fromServiceWorker(),localizedFallback:true,localizedExit:true,separateExplicitResets:true});
    }
    await checked.verify();await evidence('expanded-language-genuine-offline',observations);
  }finally{await checked.context.close();}
});
