import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
const ids = ['rio-message','wizard-form','finish','progress','step-title','step-help','answer-label','answer','back','next','rio-explain','rio-check','download'];
function fixture(){
  const elements = Object.fromEntries(ids.map(id => [id,{ value:'', textContent:'', hidden:false, disabled:false, handlers:{}, addEventListener(type,fn){this.handlers[type]=fn;}, focus(){} }]));
  let exported='';
  const sandbox={crypto:webcrypto,document:{getElementById:id=>elements[id],createElement:()=>({click(){ exported='clicked'; }})},Blob:class{constructor(parts){this.parts=parts;}},URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL(){}},setTimeout(){} };
  runInNewContext(readFileSync(new URL('./wizard.js',import.meta.url),'utf8'),sandbox);
  return {elements, get exported(){return exported;}};
}
test('RIO guides maker while wizard remains DRAFT and ordered',()=>{
  const x=fixture(), e=x.elements;
  assert.match(e['rio-message'].textContent,/IDENTITEIT/);
  e['wizard-form'].handlers.submit({preventDefault(){}});
  assert.match(e['rio-message'].textContent,/Vul eerst/);
  for(let i=0;i<12;i++){e.answer.value=`antwoord ${i}`;e['wizard-form'].handlers.submit({preventDefault(){}});}
  assert.equal(e.finish.hidden,false);
  assert.match(e.progress.textContent,/DRAFT/);
  e['rio-explain'].handlers.click();
  assert.match(e['rio-message'].textContent,/niet uitvoeren/);
  e.download.handlers.click();assert.equal(x.exported,'clicked');
});
