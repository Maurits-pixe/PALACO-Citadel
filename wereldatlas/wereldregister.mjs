// PALACO Wereldatlas v0.4 — redactionele conceptregisterdata.
// Geen registratieclaims, historische datums, geografische verificatie of autorisatie.
export const REGISTER_VERSION="0.4.0";
export const WORLDS=Object.freeze([
{id:"W-0001",name:"EARTH",icon:"🌍",summary:"Startwereld van de PALACO-wereldverkenning.",regions:["REGION-LA-PAZ","REGION-LOCUS-AMOENUS"]},
{id:"W-0002",name:"PLUTO",icon:"🦆",summary:"Conceptwereld binnen de PALACO-wereldstructuur.",regions:[]},
{id:"W-0003",name:"EVA",icon:"✧",summary:"Conceptwereld met nog uit te werken dossiers.",regions:[]},
{id:"W-0004",name:"RIO",icon:"◈",summary:"Wereldnaam; geen actieve koppeling met de RIO-chatdienst.",regions:[]},
{id:"W-0005",name:"PALACO",icon:"🏛️",summary:"Conceptwereld binnen de PALACO-wereldstructuur.",regions:[]},
{id:"W-0006",name:"6IO",icon:"✦",summary:"Wereldnaam gereserveerd voor toekomstig dossieronderzoek.",regions:[]},
{id:"W-0007",name:"E9O",icon:"✺",summary:"Wereldnaam gereserveerd voor toekomstig dossieronderzoek.",regions:[]}
]);
export const REGIONS=Object.freeze([
{id:"REGION-LA-PAZ",worldId:"W-0001",name:"LA PAZ",summary:"MUNDO-regioconcept; geen vastgestelde geografische grenzen.",sourceId:"SRC-CONCEPT-MUNDO"},
{id:"REGION-LOCUS-AMOENUS",worldId:"W-0001",name:"Locus Amoenus",summary:"Citadel-context voor samenleving, natuur en geheugen.",sourceId:"SRC-CONCEPT-CITADEL"}
]);
export const SOURCES=Object.freeze([
{id:"SRC-CONCEPT-MUNDO",label:"MUNDO / PALACO-conceptcontext",status:"CONCEPT",verified:false,reference:null},
{id:"SRC-CONCEPT-CITADEL",label:"Citadel / PALACO-conceptcontext",status:"CONCEPT",verified:false,reference:null}
]);
// Sequence ranks are presentation order; do not treat them as real-world dates.
export const EVENTS=Object.freeze([
{id:"EV-001",worldId:"W-0001",regionId:null,order:1,label:"Wereldidentiteit vastgelegd als conceptlabel",details:"EARTH / W-0001 maakt deel uit van de PALACO-conceptcatalogus.",sourceId:"SRC-CONCEPT-MUNDO",date:null,status:"CONCEPT"},
{id:"EV-002",worldId:"W-0001",regionId:"REGION-LA-PAZ",order:2,label:"LA PAZ toegevoegd als regioconcept",details:"Nog geen officiële geografische positie, grens of datering.",sourceId:"SRC-CONCEPT-MUNDO",date:null,status:"CONCEPT"},
{id:"EV-003",worldId:"W-0001",regionId:"REGION-LOCUS-AMOENUS",order:3,label:"Locus Amoenus gekoppeld aan Citadel-context",details:"Samenleving, natuur en geheugen vormen redactionele thema's.",sourceId:"SRC-CONCEPT-CITADEL",date:null,status:"CONCEPT"},
{id:"EV-004",worldId:"W-0001",regionId:null,order:4,label:"Kaartkamer als conceptpreview",details:"Schematische markeringen en regiokoppelingen zonder kaartautoriteit.",sourceId:"SRC-CONCEPT-CITADEL",date:null,status:"CONCEPT"}
]);
const WORLD=/^W-\d{4}$/;const REGION=/^REGION-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export function checkRegister({worlds=WORLDS,regions=REGIONS,sources=SOURCES,events=EVENTS}={}){
 const errors=[],unique=(items,name)=>{const ids=new Set();for(const x of items){if(ids.has(x.id))errors.push("Dubbel "+name+": "+x.id);ids.add(x.id);}return ids;};
 const ws=unique(worlds,"world"),rs=unique(regions,"region"),ss=unique(sources,"source");unique(events,"event");
 for(const w of worlds){if(!WORLD.test(w.id))errors.push("Ongeldige world-ID: "+w.id);for(const regionId of w.regions){if(!rs.has(regionId))errors.push("Ontbrekende regio: "+regionId);}}
 for(const r of regions){if(!REGION.test(r.id)||!ws.has(r.worldId))errors.push("Ongeldige regiokoppeling: "+r.id);if(!ss.has(r.sourceId))errors.push("Ontbrekende regiobron: "+r.id);const parent=worlds.find(w=>w.id===r.worldId);if(parent&&!parent.regions.includes(r.id))errors.push("Regio ontbreekt in wereldlijst: "+r.id);}
 for(const s of sources)if(s.status!=="CONCEPT"||s.verified!==false||s.reference!==null)errors.push("Onterechte bronclaim: "+s.id);
 for(const e of events){if(!ws.has(e.worldId)||e.regionId!==null&&!rs.has(e.regionId))errors.push("Gebroken tijdlijnreferentie: "+e.id);if(e.regionId!==null&&regions.find(r=>r.id===e.regionId)?.worldId!==e.worldId)errors.push("Tijdlijn-wereld mismatch: "+e.id);if(!ss.has(e.sourceId)||e.status!=="CONCEPT"||e.date!==null||!Number.isInteger(e.order)||e.order<1)errors.push("Ongeldige tijdlijnstatus: "+e.id);}
 return {ok:errors.length===0,errors};
}
export function getWorldDossier(worldId){
 const world=WORLDS.find(w=>w.id===worldId);if(!world)return null;
 return {world,regions:REGIONS.filter(r=>r.worldId===worldId),events:EVENTS.filter(e=>e.worldId===worldId).sort((a,b)=>a.order-b.order),sources:SOURCES.filter(s=>REGIONS.some(r=>r.worldId===worldId&&r.sourceId===s.id)||EVENTS.some(e=>e.worldId===worldId&&e.sourceId===s.id))};
}
