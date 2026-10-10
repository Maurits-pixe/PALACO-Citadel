import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only screenshots from artificial test contexts; no cookies, keys or traces.
const root=fileURLToPath(new URL('../../artifacts/rio-contact-browser/',import.meta.url));
function files(directory) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>
    entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);
}
const screenshots=files(root);
for(const name of ['rio-contact-receiver-delivered.png','rio-contact-receiver-mobile.png']) {
  const path=screenshots.find(path=>path.endsWith('/'+name));
  if(!path)throw new Error('EXPECTED_REFERENCE_SCREENSHOT_MISSING');
  const bytes=readFileSync(path);
  if(bytes.length>500_000||bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('BOUNDED_PNG_REQUIRED');
  process.stdout.write('RIO_PREVIEW_PNG:'+name+':'+bytes.toString('base64')+'\n');
}
