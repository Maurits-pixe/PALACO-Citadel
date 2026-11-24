'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=()=>fs.readFileSync(path.join(__dirname,'../.github/workflows/atelier-validation.yml'),'utf8');
const extractor=()=>fs.readFileSync(path.join(__dirname,'github-artifact-zip-extract.py'),'utf8');
test('ZIP extraction is restricted to exact two expected JSON basenames',()=>{
 const s=extractor();
 assert.match(s,/EXPECTED = frozenset/);
 assert.match(s,/atelier-review-evidence\.json/);
 assert.match(s,/atelier-review-integrity\.json/);
 assert.match(s,/len\(items\) != len\(EXPECTED\)/);
 assert.match(s,/\{i\.filename for i in items\} != EXPECTED/);
});
test('ZIP extraction is bounded and protects from symlinks and preexisting files',()=>{
 const s=extractor();
 assert.match(s,/MAX_ARCHIVE = 100_000/);
 assert.match(s,/MAX_MEMBER = 20_000/);
 assert.match(s,/item\.file_size > 100 \* item\.compress_size/);
 assert.match(s,/stat\.S_IFMT\(mode\)/);
 assert.match(s,/os\.O_EXCL/);
 assert.match(s,/source\.read\(MAX_MEMBER \+ 1\)/);
});
test('workflow extracts through bounded module before byte comparison',()=>{
 const y=workflow();
 const extract=y.indexOf('python3 atelier/github-artifact-zip-extract.py');
 const compare=y.indexOf('Verify extracted GitHub artifact bytes against checked source');
 assert.ok(extract>=0&&compare>extract);
 assert.doesNotMatch(y,/unzip -q/);
 assert.match(y,/--max-time 30/);
});
