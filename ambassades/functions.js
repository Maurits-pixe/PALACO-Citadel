(() => {
 'use strict';
 const section = document.getElementById('functies');
 if (!section) return;
 const picker = document.getElementById('function-picker');
 const results = document.getElementById('function-results');
 const description = document.getElementById('function-description');
 const status = document.getElementById('function-status');
 const retry = document.getElementById('function-retry');
 const fallback = {"fx_nav":"Functies & bijdragevoorstellen","fx_eyebrow":"Historische functies · Nieuwe ontwerpvoorstellen","fx_title":"Zeven functies, twaalf zetels.","fx_intro":"Bekijk hoe de zeven historische functies in v0.2 als mogelijke bijdragen aan de twaalf ontwerpzetels zijn voorgesteld.","fx_status":"Niet-bindend · Review open · Niet geratificeerd · Niet operatief","fx_notice":"Alle 36 relaties zijn nieuwe ontwerpkeuzes. De historische bron definieert functies, geen actuele koppelingen, personen of mandaten.","fx_function_label":"Historische functie","fx_all_functions":"Alle zeven functies","fx_view_seats":"Bijdragevoorstellen per zetel","fx_function_boundary":"Functiegrens","fx_source":"Historische definitie ↗","fx_reason":"Voorgestelde reden","fx_row_artifact":"Gedeeld rijartefact","fx_row_boundary":"Gedeelde bevoegdheidsgrens","fx_row_question":"Gedeelde open reviewvraag","fx_show":"Lees de voorgestelde bijdragen","fx_count":"{count} van 36 bijdragevoorstellen","fx_none":"Geen bijdragevoorstellen gevonden. Kies een andere functie.","fx_shared":"De drie relaties per zetel delen het rijartefact, de grens en de reviewvraag.","fx_source_version":"Bron & voorstelversie","fx_read_proposal":"Lees het volledige voorstel v0.2 ↗","fx_source_dates":"Momentopname van 12 oktober 2026; latere bronwijzigingen worden niet automatisch weergegeven.","fx_no_authority":"Dit overzicht verleent geen benoeming, stem, mandaat, reviewerstatus of operationele bevoegdheid.","fx_separate":"NOVA, RIO, 6RI9ADE/BRI9ADE en STEWARD blijven een afzonderlijk engineeringontwerp. Deze voorstellen veranderen geen accounttoegang, veiligheidsuitslag of HOLD.","fx_translation_notice":"Vertalingen helpen bij het lezen. De gebonden Nederlandse voorsteltekst en exacte historische bron blijven de referentie.","fx_fallback":"Alle 36 bijdragevoorstellen staan hieronder. Filteren is beschikbaar met JavaScript.","fx_loading":"Het overzicht wordt geladen…","fx_unavailable":"Het filter kan nu niet laden. Het opgeslagen voorstel blijft hieronder leesbaar.","fx_retry":"Opnieuw proberen"};
 const names = ['Listener','Representative','Translator','Connector','Reconciler','Mediator','Memory Keeper'];
 const pairs = [
  ['F03','F05','F07'],['F04','F03','F07'],['F01','F03','F02'],['F01','F03','F07'],
  ['F01','F02','F06'],['F03','F04','F07'],['F01','F03','F07'],['F04','F03','F06'],
  ['F01','F02','F03'],['F01','F02','F05'],['F04','F05','F07'],['F01','F06','F07']
 ];
 const historic = 'https://github.com/Maurits-pixe/PALACO-Citadel/blob/bcf2684d2d9c3ee5bf68a06ccf09bb856bb195bd/ARCHIVE/legacy-sources/' + encodeURIComponent('🦆🌱☄️ GO — R6.99');
 let data = null;
 let selected = 'ALL';
 let loading = false;
 let unavailable = false;
 const text = source => window.PalacoI18n?.text(source) || source;
 const label = (key,values={}) => {
  const source = (data?.labels || fallback)[key] || fallback[key];
  return window.PalacoI18n?.text(source,values) || source.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
 };
 function node(tag,className,value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
 }
 function fixed(value) { const element=node('bdi','',value);element.dir='ltr';return element; }
 function link(className,value,href) {const element=node('a',className,value);element.href=href;return element;}
 function summary(details,value) {
  const element=node('summary','',value);const plus=node('span','','+');plus.setAttribute('aria-hidden','true');
  element.append(' ',plus);details.append(element);
 }
 const string = value => typeof value === 'string' && value.length > 0 && value.length < 2500;
 function validate(value) {
  if (!value || value.schemaVersion !== 'palaco-function-contributions/0.1'
      || value.proposalVersion !== 'v0.2' || value.status !== 'PROPOSED_NONBINDING'
      || value.reviewStatus !== 'DRAFT_REVIEW_OPEN' || value.authorityGranted !== false
      || value.snapshotDate !== '2026-10-12'
      || value.sources?.proposalIssue !== 38 || value.sources?.bindingIssue !== 37
      || value.sources?.seatIssue !== 33
      || value.sources?.proposalBlob !== '2293d1f957b4b69c99676824fe64fd9b62ad2333'
      || value.sources?.historicalBlob !== '879c79b9558eef39563d55b4815c0924617148d1'
      || value.sources?.historicalCommit !== 'bcf2684d2d9c3ee5bf68a06ccf09bb856bb195bd'
      || !Array.isArray(value.functions) || value.functions.length !== 7
      || !Array.isArray(value.rows) || value.rows.length !== 12
      || !value.labels || Object.keys(fallback).some(key=>value.labels[key] !== fallback[key])) throw new Error('Unavailable proposal snapshot');
  const seen = new Set();
  for (const [i,f] of value.functions.entries()) {
   if (f.id !== 'F0'+(i+1) || f.name !== names[i] || f.line !== 46148+i
       || !string(f.description) || !string(f.boundary)) throw new Error('Invalid function');
  }
  for (const [i,row] of value.rows.entries()) {
   const number=String(i+1).padStart(2,'0');
   if (row.seat !== 'PALACO-AMB-'+number
       || ![row.portfolio,row.title,row.artifact,row.boundary,row.question].every(string)
       || !Array.isArray(row.relations) || row.relations.length!==3) throw new Error('Invalid row');
   for (const [j,r] of row.relations.entries()) {
    if (r.functionId !== pairs[i][j] || r.id !== 'AMB'+number+'-'+r.functionId+'@v0.2'
        || r.status !== 'PROPOSED' || !string(r.reason) || seen.has(r.id)) throw new Error('Invalid relation');
    seen.add(r.id);
   }
  }
  if (seen.size !== 36) throw new Error('Incomplete proposal');
  return value;
 }

 const noteLabels = {"fn_title":"Schrijf een bespreeknotitie.","fn_intro":"Kies één bijdragevoorstel en noteer je inschatting, bronnen en open bezwaren. Download de notitie met de exacte voorstelversie erbij.","fn_status":"Lokaal bespreekconcept · Geen formele beoordeling","fn_memory":"Je kunt per bijdrage een concept bijhouden. De concepten blijven alleen zolang deze pagina open is. Download elke notitie om haar te bewaren.","fn_relation":"Bijdragevoorstel","fn_choose":"Kies een bijdragevoorstel","fn_assessment":"Bespreekinschatting","fn_in_doubt":"Nog te onderzoeken","fn_usable":"Bruikbaar voor bespreking","fn_change":"Aanpassing voorgesteld","fn_insufficient":"Onvoldoende onderbouwd","fn_disputed":"Betwist","fn_argument":"Argument","fn_sources":"Bronnen of verwijzingen","fn_concerns":"Open vragen en zorgen","fn_dissent":"Bezwaren en verschilpunten","fn_reopen":"Wanneer opnieuw bespreken?","fn_optional":"Optioneel","fn_limits":"Maximaal 2.000 tekens per tekstveld; 1.000 bij opnieuw bespreken.","fn_download":"Download bespreeknotitie","fn_clear":"Wis deze notitie","fn_context":"Gekozen bijdrage","fn_ready":"Kies een bijdrage om een notitie te maken.","fn_invalid":"Kies een geldig bijdragevoorstel en vul een argument in binnen de aangegeven lengte.","fn_unavailable":"Het notitieformulier is beschikbaar zodra het bijdrageoverzicht is geladen.","fn_downloaded":"De download is gestart. Je notitie is niet verzonden.","fn_download_error":"De download kan nu niet starten. Je concept blijft op deze pagina staan.","fn_cleared":"Deze notitie is gewist. Andere concepten blijven op deze pagina staan.","fn_start":"Schrijf een notitie","fn_no_authority":"De notitie is niet verzonden of onafhankelijk beoordeeld. Zij verleent geen goedkeuring, benoeming, stem, mandaat of toegang."};
 const noteForm = document.getElementById('discussion-form');
 const noteSelect = document.getElementById('note-relation');
 const noteAssessment = document.getElementById('note-assessment');
 const noteContext = document.getElementById('note-context');
 const noteStatus = document.getElementById('note-status');
 const noteFields = {
  argument:document.getElementById('note-argument'),sources:document.getElementById('note-sources'),
  concerns:document.getElementById('note-concerns'),dissent:document.getElementById('note-dissent'),
  reopenWhen:document.getElementById('note-reopen')
 };
 const noteOutcomes = new Set(['IN_DOUBT','USABLE_FOR_DISCUSSION','CHANGE_SUGGESTED','INSUFFICIENT_SUPPORT','DISPUTED']);
 const noteDrafts = new Map();
 let noteRelation = '';
 let noteMessage = 'fn_ready';
 const noteLabel = key => text(noteLabels[key]);
 function findNoteRelation(id) {
  if (!data) return null;
  for (const row of data.rows) {
   const relation = row.relations.find(r=>r.id===id);
   if (relation) return {row,relation,func:data.functions.find(f=>f.id===relation.functionId)};
  }
  return null;
 }
 function noteValues() {
  return {outcome:noteAssessment.value,...Object.fromEntries(Object.entries(noteFields).map(([key,field])=>[key,field.value]))};
 }
 function saveNote() {if (noteRelation) noteDrafts.set(noteRelation,noteValues());}
 function switchNote(id) {
  if (id && !findNoteRelation(id)) {
   noteSelect.value=noteRelation;noteMessage='fn_invalid';noteStatus.textContent=noteLabel(noteMessage);return;
  }
  saveNote();noteRelation=id;
  const draft=noteDrafts.get(id)||{outcome:'IN_DOUBT'};
  noteSelect.value=id;noteAssessment.value=draft.outcome;
  for (const [key,field] of Object.entries(noteFields)) field.value=draft[key]||'';
  noteMessage=id?'fn_status':'fn_ready';renderNote();
 }
 function renderNote() {
  noteForm.hidden=!data;
  document.getElementById('discussion-unavailable').hidden=Boolean(data);
  if (!data) return;
  const options=document.createDocumentFragment();
  const placeholder=node('option','',noteLabel('fn_choose'));placeholder.value='';options.append(placeholder);
  for (const row of data.rows) for (const relation of row.relations) {
   const func=data.functions.find(f=>f.id===relation.functionId);
   const option=node('option','','\u2068'+relation.id+' · '+func.name+'\u2069 · '+text(row.title));
   option.value=relation.id;options.append(option);
  }
  noteSelect.replaceChildren(options);noteSelect.value=noteRelation;
  const binding=findNoteRelation(noteRelation);
  noteContext.hidden=!binding;
  if (binding) {
   const {row,relation,func}=binding,fragment=document.createDocumentFragment(),heading=node('h4');
   heading.append(fixed(relation.id),' · ',fixed(func.name),' · ',text(row.title));fragment.append(heading);
   const dl=node('dl');
   for (const [key,value] of [['fx_reason',relation.reason],['fx_row_artifact',row.artifact],['fx_row_boundary',row.boundary],['fx_row_question',row.question]]) {
    dl.append(node('dt','',label(key)),node('dd','',text(value)));
   }
   fragment.append(dl);noteContext.replaceChildren(fragment);
  } else noteContext.replaceChildren();
  noteStatus.textContent=noteLabel(noteMessage);
  for (const button of results.querySelectorAll('[data-note-relation]')) button.textContent=noteLabel('fn_start');
 }
 noteSelect.addEventListener('change',()=>switchNote(noteSelect.value));
 noteForm.addEventListener('input',event=>{
  if (event.target===noteSelect) return;
  saveNote();noteMessage=noteRelation?'fn_status':'fn_ready';noteStatus.textContent=noteLabel(noteMessage);
 });
 document.getElementById('note-clear').addEventListener('click',()=>{
  noteDrafts.delete(noteRelation);
  noteAssessment.value='IN_DOUBT';
  for (const field of Object.values(noteFields)) field.value='';
  noteMessage='fn_cleared';noteStatus.textContent=noteLabel(noteMessage);noteFields.argument.focus();
 });
 results.addEventListener('click',event=>{
  const button=event.target.closest('button[data-note-relation]');
  if (!button||!results.contains(button)||!data||loading) return;
  switchNote(button.dataset.noteRelation);
  noteForm.scrollIntoView({block:'start'});noteFields.argument.focus({preventScroll:true});
 });
 noteForm.addEventListener('submit',event=>{
  event.preventDefault();
  const binding=findNoteRelation(noteRelation),values=noteValues();
  const validFields=Object.entries(noteFields).every(([key,field])=>typeof values[key]==='string'
   && values[key].length<=(key==='reopenWhen'?1000:2000));
  if (!binding||loading||noteSelect.value!==noteRelation||!noteOutcomes.has(values.outcome)
      || !values.argument.trim()||!validFields||!noteForm.checkValidity()) {
   noteMessage='fn_invalid';noteStatus.textContent=noteLabel(noteMessage);noteForm.reportValidity();return;
  }
  saveNote();
  const {row,relation,func}=binding;
  const record={
   schemaVersion:'palaco-contribution-discussion-note/0.1',recordType:'LOCAL_DISCUSSION_DRAFT',
   createdAt:new Date().toISOString(),uiLanguage:document.documentElement.lang||'nl',
   proposal:{issueUrl:'https://github.com/Maurits-pixe/PALACO-Citadel/issues/38',
    version:data.proposalVersion,blob:data.sources.proposalBlob,snapshotDate:data.snapshotDate,
    status:data.status,reviewStatus:data.reviewStatus},
   sourceBindings:{historicalCommit:data.sources.historicalCommit,historicalBlob:data.sources.historicalBlob,
    bindingIssueUrl:'https://github.com/Maurits-pixe/PALACO-Citadel/issues/37',
    seatIssueUrl:'https://github.com/Maurits-pixe/PALACO-Citadel/issues/33'},
   relation:{id:relation.id,seat:row.seat,functionId:func.id,functionName:func.name,portfolio:row.portfolio,
    titleDutch:row.title,reasonDutch:relation.reason,
    sharedRow:{artifactDutch:row.artifact,boundaryDutch:row.boundary,reviewQuestionDutch:row.question}},
   assessment:values,reviewer:{identityStatus:'UNVERIFIED',eligibility:'NOT_ESTABLISHED',conflictStatus:'UNKNOWN'},
   authority:{independentAcceptance:false,ratification:false,appointment:false,safetyApproval:false,
    accountAccess:false,merge:false,release:false,execution:false}
  };
  let url=null;
  try {
   url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
   const download=node('a');download.href=url;download.download='PALACO-bespreeknotitie-'+relation.id.replace('@','-')+'.json';
   download.hidden=true;document.body.append(download);
   try {download.click();} finally {download.remove();}
   noteMessage='fn_downloaded';
  } catch {noteMessage='fn_download_error';}
  finally {if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);noteStatus.textContent=noteLabel(noteMessage);}
 });

 function render() {
  renderNote();
  if (!data) {
   if (unavailable) status.textContent=label('fx_unavailable');
   retry.textContent=label('fx_retry');
   return;
  }
  const open = new Set([...results.querySelectorAll('.fx-row')].filter(r=>r.querySelector('details')?.open).map(r=>r.dataset.seat));
  const openFunctions = new Set([...description.querySelectorAll('[data-function-summary]')].filter(r=>r.querySelector('details')?.open).map(r=>r.dataset.functionSummary));
  const definitions=document.createDocumentFragment();
  for (const f of data.functions.filter(f=>selected==='ALL'||f.id===selected)) {
   const article=node('article','fx-function');article.dataset.functionSummary=f.id;
   const heading=node('h3');heading.append(fixed(f.name));article.append(heading,node('p','',text(f.description)));
   const details=node('details');details.open=openFunctions.has(f.id);
   summary(details,label('fx_function_boundary'));
   details.append(node('p','',text(f.boundary)),link('text-link',label('fx_source'),historic+'#L'+f.line));
   article.append(details);definitions.append(article);
  }
  description.replaceChildren(definitions);
  const fragment=document.createDocumentFragment();
  let count=0;
  for (const row of data.rows) {
   const relations=row.relations.filter(r=>selected==='ALL'||r.functionId===selected);
   if (!relations.length) continue;
   count+=relations.length;
   const article=node('article','fx-row');article.dataset.seat=row.seat;article.dataset.portfolio=row.portfolio;
   const top=node('div','fx-row-top');
   top.append(fixed(row.seat),link('text-link',text(row.title),'#post-'+row.seat.slice(-2)));
   article.append(top,node('h3','',text(row.title)));
   const details=node('details');details.open=open.has(row.seat);
   summary(details,label('fx_show'));
   const canonical=node('small','fx-canonical');canonical.append(fixed(row.portfolio));details.append(canonical);
   const list=node('ul','fx-contributions');
   for (const relation of relations) {
    const item=node('li'),reference=link('fx-reference',undefined,'https://github.com/Maurits-pixe/PALACO-Citadel/issues/38');
    reference.dataset.relation=relation.id;reference.append(fixed(relation.id));
    const heading=node('h4');heading.append(fixed(data.functions.find(f=>f.id===relation.functionId).name));
    const reason=node('p','',text(relation.reason));reason.setAttribute('data-reason','');
    const noteButton=node('button','fn-start',noteLabel('fn_start'));noteButton.type='button';noteButton.dataset.noteRelation=relation.id;
    item.append(reference,heading,reason,noteButton);list.append(item);
   }
   details.append(list,node('p','note',label('fx_shared')));
   const dl=node('dl');
   for (const [field,key] of [['artifact','fx_row_artifact'],['boundary','fx_row_boundary'],['question','fx_row_question']]) {
    const dd=node('dd','',text(row[field]));dd.setAttribute('data-'+field,'');
    dl.append(node('dt','',label(key)),dd);
   }
   details.append(dl);article.append(details);fragment.append(article);
  }
  results.replaceChildren(fragment);
  renderNote();
  status.textContent=count ? label('fx_count',{count}) : label('fx_none');
  for (const button of picker.querySelectorAll('[data-function]')) {
   button.setAttribute('aria-pressed',String(button.dataset.function===selected));
   if (button.dataset.function==='ALL') button.textContent=label('fx_all_functions');
  }
  retry.textContent=label('fx_retry');
 }
 async function load() {
  if (loading) return;
  loading=true;unavailable=false;
  picker.hidden=true;retry.hidden=true;noteForm.hidden=true;
  status.textContent=label('fx_loading');
  try {
   const response=await fetch(new URL('function-contributions.json',document.baseURI),{
    credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)
   });
   if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')) throw new Error('No data');
   const bytes=await response.arrayBuffer();
   if (bytes.byteLength>65536 || !globalThis.crypto?.subtle) throw new Error('Data unavailable');
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
   if (digest!=='a0bec5d1eca6a0f73b855d833d691ad4dfaac1d581c831fd33fd8d06be53af2a') throw new Error('Snapshot content changed');
   const body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   data=validate(JSON.parse(body));selected='ALL';render();picker.hidden=false;
  } catch {
   data=null;renderNote();unavailable=true;status.textContent=label('fx_unavailable');retry.hidden=false;
  } finally {loading=false;retry.textContent=label('fx_retry');}
 }
 picker.addEventListener('click',event=>{
  const button=event.target.closest('button[data-function]');
  if (!button || !picker.contains(button) || !data || loading) return;
  const value=button.dataset.function;
  if (value!=='ALL'&&!data.functions.some(f=>f.id===value)) return;
  selected=value;render();
 });
 retry.addEventListener('click',load);
 window.addEventListener('palaco:languagechange',render);
 Promise.resolve(window.PalacoI18n?.ready).then(load,load);
})();
