// PALACO Wereldatlas Dependency & Security Audit v1.7 RC.
// Static inspection of locally supplied source text. Not penetration testing or an independent security attestation.
import {REQUIRED,DEPENDENCIES} from "./atlas-package-audit.mjs";
export const SECURITY_SCHEMA="palaco.atlas.dependency-security.draft.v1";
export const MAX_SOURCE_BYTES=512*1024;
export const MAX_SOURCES=56;
export const SHELL_FILES=Object.freeze([...REQUIRED,"./"]);
const EXPECTED=new Set(REQUIRED);
const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const sourceName=s=>typeof s==="string"&&EXPECTED.has(s);
const localImport=/\b(?:import|export)\s*(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g;
const htmlSource=/<(?:script|iframe)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
const staticRequest=/\b(?:fetch|importScripts)\s*\(\s*["']([^"']+)["']/g;
function links(text,isHTML){
 const deps=[],risks=[];
 for(const expression of [localImport,staticRequest,...(isHTML?[htmlSource]:[])]){expression.lastIndex=0;for(const match of text.matchAll(expression)){
  const target=match[1];
  if(/^(?:https?:)?\/\//i.test(target)||/^data:/i.test(target))risks.push({kind:"EXTERNAL_RESOURCE",target});
  else if(target.startsWith("./")||target.startsWith("../")){
   const parts=target.split("/");
   if(parts.includes(".."))risks.push({kind:"PARENT_TRAVERSAL",target});
   else if(expression===localImport)deps.push(target.replace(/^\.\//,""));
  }else if(expression===localImport&&!target.startsWith("#"))risks.push({kind:"NONLOCAL_MODULE",target});
 }}
 return {deps,risks};
}
export function inspectSources(sources,{shell=SHELL_FILES}={}){
 if(!isObj(sources)||Object.keys(sources).length>MAX_SOURCES)throw Error("Ongeldige broncollectie.");
 if(!Array.isArray(shell)||new Set(shell).size!==shell.length||shell.length!==SHELL_FILES.length||SHELL_FILES.some(s=>!shell.includes(s)))throw Error("Offline-bronnenlijst onjuist.");
 const entries=Object.entries(sources);const findings=[],seen=new Set();
 for(const [path,content] of entries){
  if(!sourceName(path)||typeof content!=="string"||new TextEncoder().encode(content).length>MAX_SOURCE_BYTES)throw Error("Onbekende, te grote of ongeldige bron.");
  seen.add(path);
  const analyzed=links(content,path.endsWith(".html"));
  for(const risk of analyzed.risks)findings.push({source:path,...risk});
  for(const dep of analyzed.deps)if(!EXPECTED.has(dep)||!seen.has(dep)&&!Object.hasOwn(sources,dep))findings.push({source:path,kind:"MISSING_IMPORT",target:dep});
 }
 for(const path of REQUIRED)if(!seen.has(path))findings.push({source:path,kind:"MISSING_SOURCE",target:path});
 for(const [parent,dep] of DEPENDENCIES)if(seen.has(parent)&&!seen.has(dep))findings.push({source:parent,kind:"MISSING_CONTRACT_DEPENDENCY",target:dep});
 for(const path of REQUIRED)if(!shell.includes(path)&&!findings.some(x=>x.kind==="MISSING_OFFLINE_ASSET"&&x.target===path))findings.push({source:path,kind:"MISSING_OFFLINE_ASSET",target:path});
 const complete=REQUIRED.every(x=>seen.has(x)),noFindings=findings.length===0;
 return {schema:SECURITY_SCHEMA,state:"DRAFT",decision:"HOLD",authorization:"DENY",verified:false,independentReview:false,
  checkedSources:seen.size,expectedSources:REQUIRED.length,shellCount:shell.length,complete,staticChecksClear:noFindings,findings,
  limitations:"Beperkte statische patrooncontrole, geen CSP-headeraudit, SAST, netwerkmonitoring, authentificatie of pentest. Brondata zijn niet extern geattesteerd."};
}
export function validateSecurityReport(report,sources,options={}){
 try{const expected=inspectSources(sources,options);
  if(JSON.stringify(report)!==JSON.stringify(expected))throw Error("Auditrapport gewijzigd.");
  return {ok:true,errors:[]};
 }catch(e){return {ok:false,errors:[e.message]}}
}
