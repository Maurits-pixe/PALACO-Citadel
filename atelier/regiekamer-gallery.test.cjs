'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const gallery=require('./regiekamer-gallery.js');
const exterior=()=>({schema:'palaco.citadel.atelier.studio/1',state:'DRAFT',authority:'NONE',name:'EVA',cells:Array(96).fill(null)});
const interior=()=>({schema:'palaco.citadel.atelier.interior/1',state:'DRAFT',authority:'NONE',name:'L.A.',floors:[Array(80).fill(null),Array(80).fill(null),Array(80).fill(null)]});
test('vier galerijlagen hebben correcte aantallen en isolatie',()=>{
 const ex=exterior(),inside=interior();
 ex.cells[0]='royal';inside.floors[2][79]='library';
 const views=['exterior','0','1','2'].map(v=>gallery.getModel(v,ex,inside));
 assert.deepEqual(views.map(v=>v.cells.length),[96,80,80,80]);
 assert.equal(views[3].cells[79],'library');assert.equal(views[1].cells[79],null);
 views[0].cells[0]='park';assert.equal(ex.cells[0],'royal');
});
test('alleen geldige DRAFT brondata worden afgebeeld',()=>{
 const ex=exterior(),inside=interior();
 assert.equal(gallery.isExterior({...ex,state:'ACTIVE'}),false);
 assert.equal(gallery.isInterior({...inside,authority:'OWNER'}),false);
 assert.equal(gallery.getModel('exterior',{...ex,state:'ACTIVE'},inside).available,false);
 assert.equal(gallery.getModel('2',ex,{...inside,authority:'OWNER'}).available,false);
 assert.equal(gallery.getModel('exterior',null,null).cells.length,96);
});
test('de renderer ontsmet XML-titels en gebruikt alleen bekende kleurschema’s',()=>{
 const model=gallery.getModel('exterior',exterior(),interior());
 model.title='<script>alert("test")</script>';model.cells[2]='water';
 const svg=gallery.renderSvg(model);
 assert.ok(svg.includes('&lt;script&gt;'));
 assert.ok(!svg.includes('<script>'));
 assert.ok(svg.includes('AUTHORITY NONE'));
 assert.ok(svg.includes('#286c84'));
});
test('ongeldige tabbladen, afmetingen en onbekende perceelcodes worden geweigerd',()=>{
 assert.throws(()=>gallery.getModel('8',exterior(),interior()),RangeError);
 assert.equal(gallery.isExterior({...exterior(),cells:Array(95).fill(null)}),false);
 assert.equal(gallery.isInterior({...interior(),floors:[Array(80).fill('forbidden'),Array(80).fill(null),Array(80).fill(null)]}),false);
 assert.throws(()=>gallery.renderSvg({cols:12,rows:8,cells:[]}),TypeError);
});
