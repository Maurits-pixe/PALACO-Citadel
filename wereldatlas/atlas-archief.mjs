// PALACO Atlas Archief v0.5 — provenance is a concept-reference graph, NOT proof of authenticity.
import {WORLDS,REGIONS,SOURCES,EVENTS,checkRegister} from "./wereldregister.mjs";
export const ARCHIVE_SCHEMA="palaco.atlas.archive.draft.v0.5";
export const ARCHIVE_VERSION="0.5.0";
const nonempty=x=>typeof x==="string"&&x.length>0;
const compare=(a,b)=>a.localeCompare(b,"nl");
export function archiveIndex(){
 const status=checkRegister();if(!status.ok)return {ok:false,errors:status.errors,items:[]};
 const items=[];
 for(const world of WORLDS)items.push({id:"DOSSIER-"+world.id,kind:"WORLD",worldId:world.id,regionId:null,title:world.name,description:world.summary,sourceIds:[],sequence:null,state:"DRAFT"});
 for(const region of REGIONS)items.push({id:"DOSSIER-"+region.id,kind:"REGION",worldId:region.worldId,regionId:region.id,title:region.name,description:region.summary,sourceIds:[region.sourceId],sequence:null,state:"DRAFT"});
 for(const event of EVENTS)items.push({id:"DOSSIER-"+event.id,kind:"EVENT",worldId:event.worldId,regionId:event.regionId,title:event.label,description:event.details,sourceIds:[event.sourceId],sequence:event.order,state:"DRAFT"});
 return {ok:true,errors:[],items};
}
export function validateArchiveIndex(index=archiveIndex()){
 const errors=[];if(!index?.ok||!Array.isArray(index.items))return {ok:false,errors:["Ongeldig register."]};
 const worldIds=new Set(WORLDS.map(x=>x.id)),regionIds=new Set(REGIONS.map(x=>x.id)),sourceIds=new Set(SOURCES.map(x=>x.id)),ids=new Set();
 for(const row of index.items){
  if(ids.has(row.id))errors.push("Dubbel dossier-ID: "+row.id);ids.add(row.id);
  if(row.state!=="DRAFT"||!["WORLD","REGION","EVENT"].includes(row.kind))errors.push("Dossierstatus onjuist: "+row.id);
  if(!worldIds.has(row.worldId)||row.regionId!==null&&!regionIds.has(row.regionId))errors.push("Referentie ontbreekt: "+row.id);
  if(row.regionId!==null&&REGIONS.find(x=>x.id===row.regionId)?.worldId!==row.worldId)errors.push("Regio/wereld mismatch: "+row.id);
  if(!nonempty(row.title)||!nonempty(row.description)||!Array.isArray(row.sourceIds)||row.sourceIds.some(x=>!sourceIds.has(x)))errors.push("Bron of dossierinhoud ongeldig: "+row.id);
  if(row.kind==="EVENT"&&(!Number.isInteger(row.sequence)||row.sequence<1))errors.push("Tijdlijnvolgorde ontbreekt: "+row.id);
 }
 return {ok:errors.length===0,errors};
}
export function queryArchive({worldId="",kind="ALL",query=""}={}){
 const index=archiveIndex();if(!validateArchiveIndex(index).ok)return [];
 const q=String(query).trim().toLocaleLowerCase("nl");
 return index.items.filter(row=>(!worldId||row.worldId===worldId)&&(kind==="ALL"||row.kind===kind)&&(!q||[row.id,row.title,row.description,row.worldId,row.regionId??"",...row.sourceIds].join(" ").toLocaleLowerCase("nl").includes(q))).sort((a,b)=>a.worldId.localeCompare(b.worldId)||({WORLD:0,REGION:1,EVENT:2}[a.kind]-{WORLD:0,REGION:1,EVENT:2}[b.kind])||(a.sequence??0)-(b.sequence??0)||compare(a.id,b.id));
}
export function makeArchiveExport({worldId="",kind="ALL",query=""}={}){
 const checked=validateArchiveIndex();if(!checked.ok)throw new Error("Archiefintegriteit geweigerd.");
 const rows=queryArchive({worldId,kind,query});
 const used=new Set(rows.flatMap(row=>row.sourceIds));
 const sources=SOURCES.filter(s=>used.has(s.id)).map(s=>({id:s.id,label:s.label,status:s.status,verified:false,reference:null}));
 return {schema:ARCHIVE_SCHEMA,state:"DRAFT",verified:false,notice:"Redactionele conceptreferenties, geen bewijs van geografische of historische authenticiteit.",filters:{worldId,kind,query},entries:rows,sources};
}
