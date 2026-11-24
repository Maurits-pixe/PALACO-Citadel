'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=()=>fs.readFileSync(path.join(__dirname,'../.github/workflows/atelier-validation.yml'),'utf8');
test('Atelier checkout pins the PR head, with manual dispatch fallback',()=>{
 const y=workflow();
 assert.match(y,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
 assert.match(y,/persist-credentials: false/);
 assert.match(y,/PALACO_CHECKOUT_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
});
test('verified checkout occurs before tests and checks actual Git HEAD',()=>{
 const y=workflow();
 const checkout=y.indexOf('Checkout exact PR head revision');
 const verify=y.indexOf('Verify checked-out commit matches candidate under review');
 const tests=y.indexOf('Test Atelier data and static route contracts');
 assert.ok(checkout>=0&&verify>checkout&&tests>verify);
 assert.match(y,/actual="\$\(git rev-parse HEAD\)"/);
 assert.match(y,/if \[\[ "\$\{actual\}" != "\$\{PALACO_CHECKOUT_SHA\}" \]\]; then/);
 assert.match(y,/exit 1/);
});
test('release HOLD gate receives the checked-out revision, not synthetic merge SHA',()=>{
 const y=workflow();
 const gate=y.slice(y.indexOf('Verify release remains HOLD without matching approved evidence'));
 assert.match(gate,/node atelier\/release-gate\.cjs "\$\(git rev-parse HEAD\)"/);
 assert.match(gate,/--enforce/);
 assert.doesNotMatch(gate,/\$\{GITHUB_SHA\}|\$GITHUB_SHA/);
});

test('pull request validation cannot pass without authenticated review observation',()=>{
 const y=workflow();
 const collector=y.indexOf('Observe current GitHub PR review history without publication');
 const verify=y.indexOf('Verify report bytes and exact event context before artifact retention');
 const upload=y.indexOf('Retain sanitized review observation for inspection');
 assert.ok(collector>=0&&verify>collector&&upload>verify);
 const verification=y.slice(verify,upload);
 assert.match(verification,/Required review observation missing/);
 assert.match(verification,/exit 1/);
 const uploader=y.slice(upload,y.indexOf('Download exact uploaded review evidence artifact',upload));
 assert.match(uploader,/if-no-files-found: error/);
 assert.doesNotMatch(uploader,/if-no-files-found: ignore/);
});

test('download uses read-only REST endpoint with bounded retries and exact artifact ID',()=>{
 const y=workflow();
 const start=y.indexOf('Download exact uploaded review evidence artifact');
 const end=y.indexOf('Verify extracted GitHub artifact bytes against checked source',start);
 assert.ok(start>=0&&end>start);
 const step=y.slice(start,end);
 assert.ok(step.includes('GITHUB_TOKEN: ${{ github.token }}'));
 assert.ok(step.includes('PALACO_ARTIFACT_ID: ${{ steps.review_artifact.outputs.artifact-id }}'));
 assert.ok(step.includes('/actions/artifacts/${PALACO_ARTIFACT_ID}/zip'));
 assert.ok(step.includes('for attempt in 1 2 3 4 5'));
 assert.ok(step.includes('--max-time 30'));
 assert.ok(step.includes('if [[ "${downloaded}" != "1" ]]; then'));
 assert.ok(y.includes('actions: read'));
 assert.ok(y.indexOf('Wait for exact artifact ID in GitHub run listing')<start);
});

test('artifact download retries remain fail-closed and never skip downstream integrity checks',()=>{
 const y=workflow();
 const start=y.indexOf('Download exact uploaded review evidence artifact');
 const end=y.indexOf('Verify extracted GitHub artifact bytes against checked source',start);
 assert.ok(start>=0&&end>start);
 const step=y.slice(start,end);
 const check=(fragment)=>assert.ok(step.includes(fragment),'Missing fail-closed contract: '+fragment);
 check('set -euo pipefail');
 check('if [[ "${code}" == "200" ]]; then');
 check('unzip -tqq "${zip_path}"');
 check('if [[ "${code}" != "404" && "${code}" != "502" && "${code}" != "503" && "${code}" != "504" ]]; then');
 check('if [[ "${attempt}" != "5" ]]; then sleep 3; fi');
 check('if [[ "${downloaded}" != "1" ]]; then');
 check('exit 1');
 assert.ok(y.indexOf('Verify extracted GitHub artifact bytes against checked source')>start);
 assert.ok(y.indexOf('Verify GitHub metadata for retained evidence artifact')>end);
 assert.ok(y.indexOf('Cross-check review evidence, receipt and GitHub metadata observation')>end);
 assert.ok(y.indexOf('Verify release remains HOLD without matching approved evidence')>end);
 assert.doesNotMatch(step,/continue-on-error:\s*true|\|\|\s*true/);
});
