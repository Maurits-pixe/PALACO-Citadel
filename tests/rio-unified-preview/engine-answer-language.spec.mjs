import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startReviewServer} from '../../scripts/serve-rio-unified-preview.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const copy={
  nl:{supported:'ANTWOORD MET BEWIJS',insufficient:'ONVOLDOENDE BEWIJS',abstention:'RIO heeft binnen dit dossier onvoldoende bewijs om deze vraag te beantwoorden.'},
  en:{supported:'ANSWER WITH EVIDENCE',insufficient:'INSUFFICIENT EVIDENCE',abstention:'RIO has insufficient evidence in this dossier to answer this question.'},
  de:{supported:'ANTWORT MIT BELEG',insufficient:'UNZUREICHENDE BELEGE',abstention:'RIO hat in diesem Dossier nicht genügend Belege, um diese Frage zu beantworten.'},
  fr:{supported:'RÉPONSE AVEC PREUVE',insufficient:'PREUVE INSUFFISANTE',abstention:'RIO ne dispose pas de preuves suffisantes dans ce dossier pour répondre à cette question.'},
  es:{supported:'RESPUESTA CON PRUEBAS',insufficient:'PRUEBAS INSUFICIENTES',abstention:'RIO no tiene pruebas suficientes en este expediente para responder a esta pregunta.'},
  it:{supported:'RISPOSTA CON PROVE',insufficient:'PROVE INSUFFICIENTI',abstention:'RIO non ha prove sufficienti in questo dossier per rispondere a questa domanda.'},
  pt:{supported:'RESPOSTA COM PROVAS',insufficient:'PROVAS INSUFICIENTES',abstention:'O RIO não tem provas suficientes neste dossier para responder a esta pergunta.'},
  ru:{supported:'ОТВЕТ С ДОКАЗАТЕЛЬСТВОМ',insufficient:'НЕДОСТАТОЧНО ДОКАЗАТЕЛЬСТВ',abstention:'В этом досье у RIO недостаточно доказательств, чтобы ответить на этот вопрос.'},
  eo:{supported:'RESPONDO KUN PRUVO',insufficient:'NESUFIĈA PRUVO',abstention:'RIO ne havas sufiĉan pruvon en ĉi tiu dosiero por respondi ĉi tiun demandon.'},
  pl:{supported:'ODPOWIEDŹ Z DOWODEM',insufficient:'NIEWYSTARCZAJĄCE DOWODY',abstention:'RIO nie ma w tym dossier wystarczających dowodów, aby odpowiedzieć na to pytanie.'},
  ar:{supported:'إجابة مع دليل',insufficient:'دليل غير كافٍ',abstention:'لا يملك RIO أدلة كافية في هذا الملف للإجابة عن هذا السؤال.'},
  zh:{supported:'有证据的回答',insufficient:'证据不足',abstention:'RIO 在此档案中没有足够的证据来回答这个问题。'},
};
const languages=Object.keys(copy),unsupportedQuestion='Welke vulkanen staan op Venus?';
const memory='TST-BRON: Mijn afspraak is dinsdag om tien uur. My appointment is Tuesday at ten. موعدي يوم الثلاثاء. <b>literal</b>.';
const supportedQuestion='Wanneer is mijn afspraak?';
let fixture,surface,source;

test.beforeEach(async({},info)=>{
  const use=info.project.use;
  surface={viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch};
});
test.beforeAll(async()=>{
  execFileSync(process.execPath,['scripts/build-rio-unified-preview.mjs'],{cwd:repository,stdio:'pipe'});
  source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim()};
  for(const file of ['rio-engine-web.mjs','engine.mjs','app.js','sw.js','index.html'])
    source[file+'Sha256']=createHash('sha256').update(await readFile(resolve(repository,'render-dist',file))).digest('hex');
  fixture=await startReviewServer({directory:resolve(repository,'render-dist'),
    manifestPath:resolve(repository,'artifacts/rio-unified-preview-build.json'),port:0});
});
test.afterAll(async()=>{await fixture?.close();});

async function checkedContext(browser){
  const context=await browser.newContext({...surface,locale:'en-US'}),errors=[],requests=[],failures=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  context.on('request',request=>requests.push({url:request.url(),method:request.method(),body:request.postData()}));
  context.on('requestfailed',request=>failures.push(request.url()));
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return !/^https?:$/.test(url.protocol)||url.origin===fixture.origin
      ?route.continue():route.abort('blockedbyclient');
  });
  return {context,requests,failures,async verify(page,language,privateText=[]){
    expect(errors).toEqual([]);
    expect(requests.filter(request=>request.method!=='GET'||request.body!==null
      ||new URL(request.url).pathname.startsWith('/api/')
      ||(/^https?:/.test(request.url)&&new URL(request.url).origin!==fixture.origin))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    const stored=await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),
      session:Object.fromEntries(Object.entries(sessionStorage))}));
    expect(stored).toEqual({local:{},session:{'palaco-language':language}});
    for(const text of privateText){
      expect(JSON.stringify(stored)).not.toContain(text);
      for(const request of requests)expect(decodeURIComponent(request.url)).not.toContain(text);
    }
    expect(context.pages()).toHaveLength(1);
  }};
}
async function activate(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function choose(page,language){
  const selector='.lang-btn[data-lang="'+language+'"]';
  await activate(page,selector);await expect(page.locator('html')).toHaveAttribute('lang',language);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  await expect(page.locator(selector)).toBeFocused();
}
async function remember(page,text=memory){
  await page.locator('#memory-input').fill(text);await page.locator('#memory-consent').check();
  await activate(page,'#memory-form button[type="submit"]');
  await expect(page.locator('#dossier-output')).toHaveAttribute('data-state','READY');
  return (await snapshot(page)).dossierId;
}
async function ask(page,text){
  await page.locator('#question-input').fill(text);await activate(page,'#question-form button[type="submit"]');
  await expect(page.locator('#engine-answer')).toBeVisible();
}
async function snapshot(page){
  return page.evaluate(()=>{
    const byId=id=>document.getElementById(id),body=byId('engine-answer-text'),state=byId('engine-answer-state');
    const panel=byId('engine-answer'),output=byId('dossier-output'),chat=byId('chat-preview-panel');
    const subject=byId('subject-dialog');
    return {language:document.documentElement.lang,dir:document.documentElement.dir,
      active:{id:document.activeElement?.id,language:document.activeElement?.dataset.lang},
      answer:{hidden:panel.hidden,state:state.textContent,text:body.textContent,sources:byId('engine-answer-sources').textContent,
        stateKey:state.getAttribute('data-engine-i18n'),textKey:body.getAttribute('data-engine-i18n'),
        language:body.getAttribute('lang'),dir:body.getAttribute('dir'),childElements:body.childElementCount},
      dossierId:output.textContent.match(/rio:dossier:[a-f0-9-]+/)?.[0]??null,dossierState:output.dataset.state,
      memoryDraft:byId('memory-input').value,consent:byId('memory-consent').checked,
      questionDraft:byId('question-input').value,questionDisabled:byId('question-input').disabled,
      chat:{hidden:chat.hidden,expanded:chat.classList.contains('is-expanded'),draft:byId('chat-preview-input').value,
        history:[...byId('chat-preview-messages').children].map(item=>item.outerHTML),
        subjectHidden:byId('chat-preview-subject').hidden,subjectOpen:byId('chat-preview-subject').open,
        followupsOpen:byId('chat-preview-followups').open},
      subject:Object.fromEntries(['subjectId','subjectType','subjectState','provenanceReference','objectReference','presentationEffect']
        .map(key=>[key,subject.dataset[key]]))};
  });
}
async function saveEvidence(name,observations,extra={},attach=true){
  const evidence={schema:'rio-engine-answer-language/1',project:test.info().project.name,source,...extra,observations};
  const path=test.info().outputPath(name+'.json');
  await writeFile(path,JSON.stringify(evidence,null,2)+'\n');
  if(attach)await test.info().attach(name,{path,contentType:'application/json'});
}
function expectInsufficient(observation){
  const {expectedLanguage:language,observed}=observation;
  expect.soft(observed.language).toBe(language);expect.soft(observed.dir).toBe(language==='ar'?'rtl':'ltr');
  expect.soft(observed.answer.hidden).toBe(false);
  expect.soft(observed.answer.state).toBe(copy[language].insufficient);
  expect.soft(observed.answer.text).toBe(copy[language].abstention);
  expect.soft(observed.answer.sources).toBe('—');
  expect.soft(observed.answer.language).toBe(language);
  expect.soft(observed.answer.dir).toBe(language==='ar'?'rtl':'ltr');
  expect.soft(observed.answer.childElements).toBe(0);
}
function expectSupported(observation,reference){
  const {expectedLanguage:language,observed}=observation;
  expect.soft(publicAnswer(observed)).toEqual({hidden:false,state:copy[language].supported,text:memory,
    sources:reference.answer.sources,language:'',dir:'auto',childElements:0});
  expect.soft(observed.dossierId).toBe(reference.dossierId);expect.soft(observed.dossierState).toBe('READY');
  for(const key of ['memoryDraft','consent','questionDraft','questionDisabled','chat','subject'])
    expect.soft(observed[key],key+' survives '+language).toEqual(reference[key]);
}
function publicAnswer(observed){
  // Translation keys are diagnostic evidence, not a participant-facing contract.
  const {stateKey,textKey,...answer}=observed.answer;return answer;
}
function expectCleared(observation,dossierId){
  expect.soft(publicAnswer(observation.observed)).toEqual({hidden:true,state:'',text:'',sources:'',
    language:null,dir:null,childElements:0});
  expect.soft(observation.observed.dossierId).toBe(dossierId);
}

test('fresh and existing insufficient-evidence answers follow all twelve real language choices in the cached offline root',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  let offline,dossierId;
  try{
    await page.goto(fixture.origin+'/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
    await checked.context.setOffline(true);const response=await page.reload();
    offline={fromServiceWorker:response.fromServiceWorker(),url:response.url()};
    await choose(page,'nl');dossierId=await remember(page);
    for(const [index,language]of languages.entries()){
      await choose(page,language);await ask(page,unsupportedQuestion);
      observations.push({action:'new-insufficient-answer',expectedLanguage:language,observed:await snapshot(page)});
      const next=languages[(index+1)%languages.length],before=await snapshot(page),requestCount=checked.requests.length,
        failureCount=checked.failures.length;
      await choose(page,next);
      observations.push({action:'existing-answer-language-change',expectedLanguage:next,before,observed:await snapshot(page),
        newRequests:checked.requests.slice(requestCount),newFailures:checked.failures.slice(failureCount)});
    }
    // Keep all twelve actual results, including the old implementation's wrong
    // text and annotations, before a failing expectation can mask later cases.
    await saveEvidence('insufficient-answer-language',observations,{offline,dossierId},false);
    expect(offline.fromServiceWorker).toBe(true);expect(dossierId).toMatch(/^rio:dossier:/);
    for(const observation of observations){
      expectInsufficient(observation);expect.soft(observation.observed.dossierId).toBe(dossierId);
      expect.soft(observation.observed.questionDraft).toBe(unsupportedQuestion);
      expect.soft(observation.observed.memoryDraft).toBe('');expect.soft(observation.observed.consent).toBe(false);
      expect.soft(observation.observed.questionDisabled).toBe(false);
      if(observation.before){
        // The separate unsent chat welcome deliberately follows UI language.
        // Its node count and the rest of its work state must remain stable.
        expect.soft({...observation.observed.chat,history:[]}).toEqual({...observation.before.chat,history:[]});
        expect.soft(observation.observed.chat.history).toHaveLength(observation.before.chat.history.length);
        expect.soft(observation.observed.subject).toEqual(observation.before.subject);
        expect.soft(observation.newRequests).toEqual([]);expect.soft(observation.newFailures).toEqual([]);
      }
    }
    await checked.verify(page,'nl',[memory,unsupportedQuestion]);
  }finally{
    try{await saveEvidence('insufficient-answer-language',observations,{offline,dossierId});}finally{await checked.context.close();}
  }
});

test('mixed-language evidence stays verbatim through language changes and answer transitions, replacement and reset cannot revive it',async({browser})=>{
  const checked=await checkedContext(browser),page=await checked.context.newPage(),observations=[];
  const memoryDraft='TST-next-memory مسودة',questionDraft='TST-next-question <i>draft</i>',
    chatSent='TST-chat-sent <b>literal</b>',chatDraft='TST-chat-draft remains';
  let reference;
  try{
    await page.goto(fixture.origin+'/');await choose(page,'nl');await remember(page);
    await ask(page,unsupportedQuestion);
    observations.push({action:'insufficient-before-supported',expectedLanguage:'nl',observed:await snapshot(page)});
    await ask(page,supportedQuestion);
    await page.locator('#memory-input').fill(memoryDraft);await page.locator('#memory-consent').check();
    await page.locator('#question-input').fill(questionDraft);
    await activate(page,'[data-subject="elixer"]');await activate(page,'#subject-continue');
    await activate(page,'#chat-preview-subject summary');await activate(page,'#chat-preview-followups summary');
    await page.locator('#chat-preview-input').fill(chatSent);await activate(page,'#chat-preview-send');
    await page.locator('#chat-preview-input').fill(chatDraft);await activate(page,'#chat-preview-size');
    reference=await snapshot(page);
    const answer=await page.locator('#engine-answer-text').elementHandle();
    for(const language of languages){
      const requestCount=checked.requests.length;await choose(page,language);
      observations.push({action:'supported-answer-language-change',expectedLanguage:language,observed:await snapshot(page),
        sameAnswerNode:await answer.evaluate(element=>element===document.querySelector('#engine-answer-text')),
        newRequests:checked.requests.slice(requestCount)});
    }
    await ask(page,unsupportedQuestion);
    observations.push({action:'supported-to-insufficient',expectedLanguage:'zh',observed:await snapshot(page)});
    await choose(page,'ar');
    observations.push({action:'existing-insufficient-after-supported',expectedLanguage:'ar',observed:await snapshot(page)});
    await ask(page,supportedQuestion);
    observations.push({action:'insufficient-back-to-supported',expectedLanguage:'ar',observed:await snapshot(page)});
    const replacementId=await remember(page,'TST-NEW: De reserveparaplu is paars.');
    for(const language of languages){
      await choose(page,language);
      observations.push({action:'replacement-cleared-answer',expectedLanguage:language,expectedDossierId:replacementId,observed:await snapshot(page)});
    }
    await ask(page,unsupportedQuestion);
    observations.push({action:'insufficient-before-reset',expectedLanguage:'zh',observed:await snapshot(page)});
    await activate(page,'#engine-clear');await expect(page.locator('#engine-clear-cancel')).toBeFocused();
    await activate(page,'#engine-clear-confirm');await expect(page.locator('#engine-clear-dialog')).not.toBeVisible();
    for(const language of languages){
      await choose(page,language);
      observations.push({action:'reset-cleared-answer',expectedLanguage:language,observed:await snapshot(page)});
    }
    await saveEvidence('supported-answer-language-and-clear',observations,{reference},false);
    expect(reference.answer.text).toBe(memory);expect(reference.answer.sources).toMatch(/^rio:memory:[a-f0-9-]+$/);
    expect(reference.subject.subjectId).toBeTruthy();expect(reference.chat.subjectOpen).toBe(true);
    expect(reference.chat.followupsOpen).toBe(true);expect(reference.chat.expanded).toBe(true);
    for(const observation of observations){
      if(observation.action==='supported-answer-language-change'){
        expectSupported(observation,reference);expect.soft(observation.sameAnswerNode).toBe(true);
        expect.soft(observation.newRequests).toEqual([]);
      }else if(observation.action.includes('cleared-answer')){
        expectCleared(observation,observation.expectedDossierId??null);
        expect.soft(observation.observed.chat).toEqual(reference.chat);
        expect.soft(observation.observed.subject).toEqual(reference.subject);
        if(observation.action==='reset-cleared-answer'){
          expect.soft(observation.observed.questionDisabled).toBe(true);
          expect.soft(observation.observed.dossierState).toBe('CONSENT_REQUIRED');
          expect.soft(observation.observed.memoryDraft).toBe('');expect.soft(observation.observed.questionDraft).toBe('');
          expect.soft(observation.observed.consent).toBe(false);
        }else expect.soft(observation.expectedDossierId).not.toBe(reference.dossierId);
      }else if(observation.action==='insufficient-back-to-supported'){
        expect.soft(publicAnswer(observation.observed)).toEqual({hidden:false,state:copy.ar.supported,text:memory,
          sources:reference.answer.sources,language:'',dir:'auto',childElements:0});
        expect.soft(observation.observed.dossierId).toBe(reference.dossierId);
      }else expectInsufficient(observation);
    }
    await checked.verify(page,'zh',[memory,memoryDraft,questionDraft,chatSent,chatDraft]);
  }finally{
    try{await saveEvidence('supported-answer-language-and-clear',observations,{reference});}finally{await checked.context.close();}
  }
});
