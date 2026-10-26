import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildUnifiedPreview, OUTPUT_FILES, CSP, PREVIEW_ORIGIN, TRIAL_ORIGIN} from './build-rio-unified-preview.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source=path=>readFileSync(resolve(root,path),'utf8');
const bytes=path=>readFileSync(resolve(root,path));
const hash=path=>createHash('sha256').update(bytes(path)).digest('hex');
const before={app:hash('ambassades/rio/palaco-rio-start-v0.1.html'),worker:hash('ambassades/rio/sw.js')};
const record=buildUnifiedPreview();
function files(dir, prefix='') {
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);
}

test('actual static output contains only the explicit public surface; no backend, source contracts or test fixtures leak',()=>{
 assert.equal(OUTPUT_FILES.length,29);
 assert.deepEqual(files(resolve(root,'render-dist')).sort(), [...OUTPUT_FILES].sort());
 for(const icon of ['citadel-icon.png','hara-icon.png','mundo-icon.png'])assert.deepEqual(bytes('render-dist/'+icon),bytes('ambassades/rio/visitcard/'+icon));
 assert.equal(hash('ambassades/rio/visitcard/mundo-icon.png'),'fc3d09b49035bde97673194b3730e0440223c621b0feb3222d2a473fb2ec7579');
 for(const file of ['hara/index.html','hara/app.css','hara/app.js'])
   assert.equal(source('render-dist/'+file),source('ambassades/rio/visitcard/'+file).replace(/\r\n/g,'\n'));
 const reference=bytes('ambassades/rio/visitcard/hara/reference.jpg');
 assert.equal(reference.length,31511);assert.equal(reference.subarray(0,3).toString('hex'),'ffd8ff');
 assert.deepEqual(bytes('render-dist/hara/reference.jpg'),reference);
 for(const file of record.files){assert.equal(hash('render-dist/'+file.path),file.sha256);assert.ok(file.bytes>0);}
 for(const path of ['/api/rio/nova/session','auth/server.mjs','.env','rio/identity-design/draft.json','members.example.json','README.md','source-record.json','hara/.env','hara/source-record.json','hara/private.json']) {
   assert.ok(!record.files.some(file=>file.path===path.replace(/^\//,'')));
 }
 assert.equal(record.backendPublished,false);assert.equal(record.accountActive,false);assert.equal(record.canOpenContact,false);assert.equal(record.operativeAuthority,'NONE');
});

test('build transforms only preview artifacts; web app uses a self-only external script while download stays standalone',()=>{
 assert.equal(hash('ambassades/rio/palaco-rio-start-v0.1.html'),before.app);
 assert.equal(hash('ambassades/rio/sw.js'),before.worker);
 const online=source('render-dist/rio/index.html'),download=source('render-dist/rio/download');
 assert.equal(record.onlineInlineScripts,false);assert.equal(record.downloadInlineScripts,true);
 assert.equal(Object.hasOwn(record,'inlineScripts'),false);
 for(const path of ['index.html','rio/index.html','rio/reception/index.html','hara/index.html']) {
   assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(source('render-dist/'+path)),path);
 }
 assert.ok(online.includes('<script src="/rio/start.js" defer>'));
 assert.ok(download.includes('<script>'));assert.ok(!/<script[^>]*\bsrc=/i.test(download));
 assert.ok(Buffer.byteLength(download)<100*1024);
 assert.ok(source('render-dist/rio/start.js').includes("novaLink.href='"+TRIAL_ORIGIN+"'"));
 assert.ok(source('render-dist/rio/sw.js').includes('palaco-rio-start-v0.1-9'));
 assert.ok(source('render-dist/rio/sw.js').includes("'/rio/start.js'"));
 assert.ok(source('ambassades/rio/sw.js').includes('palaco-rio-start-v0.1-4'));
 assert.deepEqual(JSON.parse(source('render-dist/rio/manifest.webmanifest')),JSON.parse(source('ambassades/rio/manifest.webmanifest')));
});

test('static reception disables measurement and names only the fixed HTTPS trial host; deployment stays manual and static',()=>{
 const html=source('render-dist/rio/reception/index.html');
 assert.ok(html.includes('data-runtime-mode="static-preview"'));
 for(const path of ['/rio/nova/','/rio/device-test/'])assert.ok(html.includes('href="'+TRIAL_ORIGIN+path+'"'));
 assert.ok(!html.includes('href="/rio/nova/"'));assert.ok(!html.includes('href="/rio/device-test/"'));
 for(const [id,path] of [['start-device-test','device-test'],['start-nova','nova'],['nova-guide-device','device-test'],['nova-guide-reception','nova']]) {
   const links=[...html.matchAll(new RegExp('<a id="'+id+'"[^>]*>','g'))];
   assert.equal(links.length,1,id);
   assert.ok(links[0][0].includes('href="'+TRIAL_ORIGIN+'/rio/'+path+'/"'),id);
   assert.ok(links[0][0].includes('target="_blank"'),id);
   assert.ok(links[0][0].includes('rel="noopener noreferrer"'),id);
 }
 assert.ok(html.includes('id="nova-trial-destination" class="nova-language-scope">'));
 assert.ok(html.includes('<bdi dir="ltr" lang="en">'+new URL(TRIAL_ORIGIN).hostname+'</bdi>'));
 const original=source('ambassades/rio/reception/index.html');
 assert.ok(original.includes('id="nova-trial-destination" class="nova-language-scope" hidden'));
 assert.ok(original.includes('href="/rio/device-test/"'));assert.ok(original.includes('href="/rio/nova/"'));
 const profile=JSON.parse(source('ambassades/deployment/render-unified-preview.yaml'));
 assert.equal(profile.services.length,1);
 const service=profile.services[0];
 assert.equal(service.name,new URL(PREVIEW_ORIGIN).hostname.split('.')[0]);assert.equal(service.runtime,'static');
 assert.equal(service.branch,'codex/rio-nova-multilingual-draft');
 assert.equal(service.autoDeployTrigger,'off');assert.equal(service.staticPublishPath,'render-dist');
 assert.equal(service.buildCommand,'node scripts/build-rio-unified-preview.mjs');
 assert.equal(service.headers.find(header=>header.name==='Content-Security-Policy').value,CSP);
 assert.ok(!service.envVars.some(item=>/OIDC|SECRET|TOKEN|DATABASE|KEY/.test(item.key)));
 assert.ok(!CSP.includes("script-src 'self' 'unsafe-inline'"));
});
