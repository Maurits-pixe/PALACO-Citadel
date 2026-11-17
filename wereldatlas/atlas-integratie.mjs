// PALACO Atlas Integratiekern 1.0 RC — deterministic local navigation, NOT a live integration.
import {WORLDS,REGIONS,EVENTS,checkRegister} from "./wereldregister.mjs";
import {archiveIndex,validateArchiveIndex} from "./atlas-archief.mjs";
export const INTEGRATION_SCHEMA="palaco.atlas.integration.readonly.v1";
export const GATE="HOLD";
export const MODULES=Object.freeze([
 {id:"catalog",title:"Atlas der Werelden",href:"./",stage:"DRAFT",description:"Doorzoek zeven wereldconcepten."},
 {id:"map",title:"De Kaartkamer",href:"./kaartkamer.html",stage:"DRAFT",description:"Schematische EARTH-verkenning."},
 {id:"inspector",title:"Dossierinspectie",href:"./dossierinspectie.html",stage:"DRAFT",description:"Lokaal WORLD/MUNDO-DRAFT-contract."},
 {id:"registry",title:"Wereldregister",href:"./wereldregister.html",stage:"DRAFT",description:"Werelden, regio's en conceptbronnen."},
 {id:"archive",title:"Atlas Archief",href:"./atlas-archief.html",stage:"DRAFT",description:"Doorzoekbare dossier- en ontwikkellijnindex."},
 {id:"review",title:"Verificatiekamer",href:"./atlas-verificatie.html",stage:"DRAFT",description:"Beoordelingsvoorbereiding, altijd DENY."},
 {id:"evidence",title:"Bewijskamer",href:"./atlas-bewijs.html",stage:"DRAFT",description:"Lokale SHA-256-integriteitscontrole."},
 {id:"provenance",title:"Provenance Centrum",href:"./atlas-provenance.html",stage:"DRAFT",description:"Interne hashketen zonder trust anchor."},
 {id:"trust",title:"Trust & Lineage Gateway",href:"./atlas-trust-gateway.html",stage:"DRAFT",description:"Niet-geauthenticeerde checkpointvergelijking."}
]);
export const EXTERNAL=Object.freeze([
 {id:"MUNDO",status:"NOT_CONNECTED",purpose:"WORLD-data uitwisseling",write:false},
 {id:"QUAY",status:"NOT_CONNECTED",purpose:"Provenance attestatie",write:false},
 {id:"ERA",status:"NOT_CONNECTED",purpose:"Bewijs- en beslislineage",write:false},
 {id:"PALACO_ONE",status:"NOT_CONNECTED",purpose:"Identiteit en autorisatie",write:false}
]);
const allowedPath=/^\.\/(?:[a-z0-9-]+\.html)?$/;
export function validateIntegration(){
 const errors=[],ids=new Set(),urls=new Set();
 for(const m of MODULES){
  if(ids.has(m.id)||urls.has(m.href))errors.push("Dubbele module: "+m.id);
  ids.add(m.id);urls.add(m.href);
  if(!allowedPath.test(m.href)||m.stage!=="DRAFT"||!m.title||!m.description)errors.push("Ongeldige module: "+m.id);
 }
 const internal=checkRegister(),archive=validateArchiveIndex(archiveIndex());
 if(!internal.ok)errors.push(...internal.errors);
 if(!archive.ok)errors.push(...archive.errors);
 if(EXTERNAL.some(x=>x.status!=="NOT_CONNECTED"||x.write!==false))errors.push("Externe koppeling zonder autorisatie.");
 return {ok:errors.length===0,errors};
}
export function snapshot(){
 const status=validateIntegration();
 if(!status.ok)return {schema:INTEGRATION_SCHEMA,ready:false,gate:GATE,errors:status.errors};
 return {schema:INTEGRATION_SCHEMA,ready:true,gate:GATE,release:"RC_NOT_APPROVED",counts:{worlds:WORLDS.length,regions:REGIONS.length,events:EVENTS.length,dossiers:archiveIndex().items.length,modules:MODULES.length},external:EXTERNAL.map(x=>({...x})),authorization:"DENY",verified:false};
}
export function selectedWorld(id){
 const world=WORLDS.find(x=>x.id===id);
 if(!world)return null;
 return {id:world.id,name:world.name,summary:world.summary,regionCount:REGIONS.filter(x=>x.worldId===id).length,registryHref:"./wereldregister.html?world="+encodeURIComponent(id),profileHref:"./?world="+encodeURIComponent(id)};
}
