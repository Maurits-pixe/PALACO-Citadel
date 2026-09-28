const steps = [
  ['IDENTITEIT','Naam van je Citadel','Kies een eigen naam. Je neemt de structuur van L.A. over, niet haar identiteit.'],
  ['BEDOELING','Wat wil je maken?','Beschrijf het doel van jouw Citadel in je eigen woorden.'],
  ['QUESTION','Wat is de centrale vraag?','Een scherpe vraag maakt latere besluiten controleerbaar.'],
  ['EVIDENCE','Welke bronnen of waarnemingen zijn er?','Noem herkomst en onzekerheden. Een afbeelding is creatieve inhoud, geen bewijs.'],
  ['EPISTEMIC_STATE','Wat weet je, en wat nog niet?','Maak onzekerheid zichtbaar voordat je een besluit neemt.'],
  ['DECISION_THRESHOLD','Welke drempel geldt voor een besluit?','Leg vast wanneer het bewijs voldoende zou zijn.'],
  ['DECISION','Wat is het voorgestelde besluit?','Dit is een voorstel in een concept; geen formele autorisatie.'],
  ['AUTHORIZATION','Wie zou bevoegd moeten beslissen?','Beschrijf de vereiste rol. Deze wizard geeft geen bevoegdheid.'],
  ['EXECUTION','Welke uitvoering zou volgen?','Beschrijf een mogelijke uitvoering. De wizard voert niets uit.'],
  ['CONSEQUENCE','Welke gevolgen verwacht je?','Benoem gewenste en ongewenste gevolgen.'],
  ['NEW_EVIDENCE','Welke nieuwe informatie zou je verzamelen?','Denk aan controle na een besluit.'],
  ['REASSESSMENT','Wanneer beoordeel je opnieuw?','Leg een herbeoordelingsmoment en aanleiding vast.']
];
const $ = id => document.getElementById(id);
const project = { schema:'palaco.atelier.draft/0.1', created_from:'LA-CITADEL-TEMPLATE-v0.1.0', source_citadel:'EVA-LA-001', state:'DRAFT', project_id:crypto.randomUUID(), citadel_id:crypto.randomUUID(), responses:{}, audit:[] };
let index=0;
function rio(message){ $('rio-message').textContent=message; }
function render(){
  if(index===steps.length){ $('wizard-form').hidden=true; $('finish').hidden=false; $('progress').textContent='Traject voltooid · DRAFT'; $('step-title').textContent='Jouw Citadel-concept'; $('step-help').textContent=`Citadel-ID: ${project.citadel_id}`; rio('Het traject is ingevuld. Controleer het concept. Een onafhankelijke review, bewijs en bevoegdheid zijn nog nodig voor activatie.'); return; }
  $('wizard-form').hidden=false; $('finish').hidden=true;
  const [key,label,help]=steps[index];
  $('progress').textContent=`Stap ${index+1} van ${steps.length} · ${key}`;
  $('step-title').textContent=label; $('answer-label').textContent=label; $('step-help').textContent=help;
  $('answer').value=project.responses[key]||''; $('back').disabled=index===0;
  $('next').textContent=index===steps.length-1?'Maak DRAFT':'Verder';
  rio(`We zijn bij ${key}. ${help}`);
}
$('wizard-form').addEventListener('submit',event=>{event.preventDefault();const value=$('answer').value.trim();if(!value){rio('Vul eerst deze stap in. Jij bepaalt de inhoud.');$('answer').focus();return;}const key=steps[index][0];project.responses[key]=value;project.audit.push({sequence:project.audit.length+1,event:'STEP_RECORDED',step:key});index++;render();});
$('back').addEventListener('click',()=>{if(index>0){index--;render();}});
$('rio-explain').addEventListener('click',()=>rio(index<steps.length?steps[index][2]:'Het concept is DRAFT. RIO kan de activering niet uitvoeren.'));
$('rio-check').addEventListener('click',()=>rio(index<steps.length?($('answer').value.trim()?'Deze stap heeft invoer. Lees hem na en kies zelf Verder.':'Deze stap mist nog jouw antwoord.'): 'De lokale stappen zijn ingevuld. Onafhankelijke review en activatie blijven open.'));
$('download').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`palaco-citadel-${project.citadel_id}-DRAFT.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
render();
