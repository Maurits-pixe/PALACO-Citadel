import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const binding=JSON.parse(await readFile(new URL('./independent/snapshot-binding.json',import.meta.url),'utf8'));
for(const file of binding.files){
  const data=await readFile(new URL('../'+file.path,import.meta.url));
  if(createHash('sha256').update(data).digest('hex')!==file.sha256)throw Error(`Frozen source changed: ${file.path}`);
}
console.log(`Inspected source matches ${binding.subject_commit}: ${binding.files.length} files`);
