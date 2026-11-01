// EARTH-119: enforce the approved attested entry point in deployment code.
// Pure static source scan; this is a guardrail, not proof of runtime call-graph completeness.
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
const root=process.cwd();
const scanDirs=['src','server','api','apps','crates'];
const allowed=new Set(['DOCS/earth-040/earth-108-signed-evidence.mjs','DOCS/earth-040/earth-108-signed-evidence.test.mjs','DOCS/earth-040/earth-111-protocol-integration.test.mjs','DOCS/earth-040/earth-118-attested-audit.mjs']);
const failures=[];
function walk(dir){
 let entries;try{entries=readdirSync(join(root,dir),{withFileTypes:true});}catch{return;}
 for(const entry of entries){
  const path=join(dir,entry.name);
  if(entry.isDirectory()){if(!['node_modules','.git','target','dist'].includes(entry.name))walk(path);continue;}
  if(!entry.isFile()||!/[.](mjs|js|cjs|ts|tsx)$/.test(entry.name)||allowed.has(path))continue;
  const source=readFileSync(join(root,path),'utf8');
  if(/(?:import|require\\s*\\(|from\\s*['"])[^\\n]*earth-108-signed-evidence/.test(source)||/\\bverifySignedAuditEvidence\\s*\\(/.test(source))failures.push(path);
 }
}
for(const dir of scanDirs)walk(dir);
if(failures.length){console.error('EARTH-119: direct verifier access detected:',failures);process.exitCode=1;}
else console.log('EARTH-119: no direct verifier use found in scanned application directories');
