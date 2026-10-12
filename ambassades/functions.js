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
 function render() {
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
    item.append(reference,heading,reason);list.append(item);
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
  picker.hidden=true;retry.hidden=true;
  status.textContent=label('fx_loading');
  try {
   const response=await fetch(new URL('function-contributions.json',document.baseURI),{
    credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)
   });
   if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')) throw new Error('No data');
   const body=await response.text();
   if (body.length>65536) throw new Error('Data exceeds limit');
   data=validate(JSON.parse(body));selected='ALL';render();picker.hidden=false;
  } catch {
   data=null;unavailable=true;status.textContent=label('fx_unavailable');retry.hidden=false;
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
