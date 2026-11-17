/* PALACO Atelier gallery: pure visualization, no storage writes or authority. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.PalacoAtelierGallery=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const EX={
    royal:['#a78857','♛','Paleis'],home:['#627e60','⌂','Wonen'],park:['#386b45','♣','Park'],water:['#286c84','≈','Water'],
    culture:['#785a7c','✦','Cultuur'],trade:['#806e4e','◆','Markt'],care:['#578079','✚','Welzijn'],path:['#807a68','▦','Pad'],
    observatory:['#455b84','✧','Observatorium'],atelier:['#875c73','✎','Atelier'],garden:['#498449','❀','Tuin'],bridge:['#6c8888','⌁','Brug']
  };
  const IN={
    salon:['#887051','♛','Salon'],bedroom:['#76627c','☾','Slaapkamer'],kitchen:['#647a5d','♨','Keuken'],
    bath:['#4a7b8d','◈','Badkamer'],library:['#766043','▤','Bibliotheek'],gallery:['#826481','✦','Galerij'],
    atelier:['#8b637a','✎','Atelier'],terrace:['#5c805a','❀','Terras'],hall:['#807b67','◇','Hal'],
    stairs:['#64738f','↟','Trap'],pool:['#398ba5','≈','Zwembad'],wellness:['#62978b','✧','Wellness'],
    dining:['#a07c50','♧','Eetkamer'],greenhouse:['#5b915e','☘','Serre']
  };
  function escapeXml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  function isExterior(v){return Boolean(v&&v.schema==='palaco.citadel.atelier.studio/1'&&v.state==='DRAFT'&&v.authority==='NONE'&&typeof v.name==='string'&&v.name.length<=80&&Array.isArray(v.cells)&&v.cells.length===96&&v.cells.every(k=>k===null||Object.prototype.hasOwnProperty.call(EX,k)));}
  function isInterior(v){return Boolean(v&&v.schema==='palaco.citadel.atelier.interior/1'&&v.state==='DRAFT'&&v.authority==='NONE'&&typeof v.name==='string'&&v.name.length<=80&&Array.isArray(v.floors)&&v.floors.length===3&&v.floors.every(f=>Array.isArray(f)&&f.length===80&&f.every(k=>k===null||Object.prototype.hasOwnProperty.call(IN,k))));}
  function getModel(view,ex,inside){
    if(view==='exterior')return {title:'Exterieur · Grand Studio',cols:12,rows:8,cells:isExterior(ex)?ex.cells.slice():Array(96).fill(null),palette:EX,available:isExterior(ex)};
    const floor=Number(view);
    if(!Number.isInteger(floor)||floor<0||floor>2)throw new RangeError('Ongeldige verdieping');
    return {title:['Interieur · Begane grond','Interieur · Eerste verdieping','Interieur · Tweede verdieping'][floor],cols:10,rows:8,cells:isInterior(inside)?inside.floors[floor].slice():Array(80).fill(null),palette:IN,available:isInterior(inside)};
  }
  function renderSvg(model){
    if(!model||![10,12].includes(model.cols)||model.rows!==8||model.cells?.length!==model.cols*model.rows)throw new TypeError('Ongeldig galerijmodel');
    const cell=49,gap=5,left=22,top=85,w=left*2+model.cols*(cell+gap)-gap,h=top+model.rows*(cell+gap)+37;
    let blocks='';
    for(let i=0;i<model.cells.length;i++){
      const code=model.cells[i],entry=code&&Object.prototype.hasOwnProperty.call(model.palette,code)?model.palette[code]:null;
      const x=left+(i%model.cols)*(cell+gap),y=top+Math.floor(i/model.cols)*(cell+gap);
      blocks+='<rect x="'+x+'" y="'+y+'" width="'+cell+'" height="'+cell+'" rx="7" fill="'+(entry?entry[0]:'#24483b')+'" stroke="#8ca48c"/>';
      if(entry)blocks+='<text x="'+(x+cell/2)+'" y="'+(y+32)+'" text-anchor="middle" font-size="25" fill="#f6e7bd">'+escapeXml(entry[1])+'</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img" aria-labelledby="galleryTitle galleryDesc"><title id="galleryTitle">'+escapeXml(model.title)+'</title><desc id="galleryDesc">Lokale schematische DRAFT-maquette met '+model.cells.filter(Boolean).length+' ingerichte percelen. '+(model.available?'Gegevens geladen.':'Geen geldig lokaal ontwerp gevonden.')+'</desc><rect width="'+w+'" height="'+h+'" fill="#0b251c"/><text x="'+left+'" y="43" font-family="Georgia" font-size="23" fill="#e5c380">'+escapeXml(model.title)+'</text><text x="'+left+'" y="65" font-size="11" letter-spacing="2" fill="#bbd0bf">PALACO · CREATIVE PREVIEW · AUTHORITY NONE</text>'+blocks+'<text x="'+left+'" y="'+(h-15)+'" font-size="11" fill="#d9c18b">DRAFT · SCHEMATISCHE WEERGAVE · GEEN BOUWKUNDIGE TEKENING</text></svg>';
  }
  return Object.freeze({getModel,renderSvg,isExterior,isInterior});
});
