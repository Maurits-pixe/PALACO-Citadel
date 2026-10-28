import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {request} from 'node:http';
import {buildUnifiedPreview, OUTPUT_FILES, CSP} from './build-rio-unified-preview.mjs';
import {loadReviewSnapshot, startReviewServer, REVIEW_FILES, REVIEW_CSP} from './serve-rio-unified-preview.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const record = buildUnifiedPreview();
const temporary = realpathSync(mkdtempSync(resolve(tmpdir(), 'rio-unified-review-')));
after(() => {
  const actual = realpathSync(temporary), base = realpathSync(tmpdir());
  assert.ok(actual.startsWith(base + sep) && actual === temporary);
  rmSync(actual, {recursive:true, force:true});
});
let index = 0;
function fixture() {
  const directory = resolve(temporary, String(++index), 'public');
  cpSync(resolve(root, 'render-dist'), directory, {recursive:true});
  const manifestPath = resolve(directory, '../build-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(record));
  return {directory, manifestPath};
}
function get(origin, path, options = {}) {
  return new Promise((accept, reject) => {
    const client = request(origin, {...options, path}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => accept({status:response.statusCode, headers:response.headers, body:Buffer.concat(chunks)}));
    });
    client.on('error', reject); client.end();
  });
}

test('portable launcher uses only its adjacent package and matches the builder surface and CSP', async () => {
  assert.deepEqual(REVIEW_FILES, OUTPUT_FILES); assert.equal(REVIEW_CSP, CSP);
  const paths = fixture(), launcher = resolve(paths.directory, '../review-server.mjs');
  copyFileSync(resolve(root, 'scripts/serve-rio-unified-preview.mjs'), launcher);
  const portable = await import(pathToFileURL(launcher));
  assert.deepEqual(portable.defaultReviewPaths(), paths);
  assert.equal(portable.loadReviewSnapshot(paths).size, 22);
});

test('manifest cannot add private files, repeat entries, or turn on operational flags', () => {
  const paths = fixture();
  for (const change of [copy => {copy.files[0].path = '.env';},
    copy => {copy.files[0] = copy.files[1];}, copy => {copy.backendPublished = true;},
    copy => {copy.onlineInlineScripts = true;}, copy => {copy.downloadInlineScripts = false;}]) {
    const changed = structuredClone(record); change(changed);
    writeFileSync(paths.manifestPath, JSON.stringify(changed));
    assert.throws(() => loadReviewSnapshot(paths), /INVALID_BUILD_MANIFEST/);
  }
});

test('changed file bytes fail verification before a server is created', async () => {
  const paths = fixture(), target = resolve(paths.directory, 'index.html');
  const changed = readFileSync(target); changed[0] ^= 1; writeFileSync(target, changed);
  assert.throws(() => loadReviewSnapshot(paths), /BUILD_HASH_MISMATCH/);
  await assert.rejects(startReviewServer({...paths, port:0}), /BUILD_HASH_MISMATCH/);
});

test('public symlinks are refused even when the outside target has the expected bytes', t => {
  const paths = fixture(), target = resolve(paths.directory, 'icon-192.svg');
  const outside = resolve(paths.directory, '../outside.svg'); copyFileSync(target, outside); rmSync(target);
  try {symlinkSync(outside, target, 'file');}
  catch (error) {if (process.platform === 'win32' && error.code === 'EPERM') return t.skip('Windows file-symlink privilege unavailable; requires Linux CI'); throw error;}
  assert.throws(() => loadReviewSnapshot(paths), /UNSAFE_PUBLIC_FILE/);
});

test('real loopback server confines files, methods, Host and Origin and serves immutable verified bytes', async t => {
  const paths = fixture(), review = await startReviewServer({...paths, port:0});
  t.after(() => review.close());
  assert.equal(new URL(review.origin).hostname, '127.0.0.1');
  const home = await get(review.origin, '/');
  assert.equal(home.status, 200); assert.equal(home.headers['content-security-policy'], CSP);
  assert.equal(home.headers['access-control-allow-origin'], undefined);
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
  for (const path of ['/api/rio/nova/session', '/.env', '/build-manifest.json', '/review-server.mjs', '/rio/identity-design/draft.json', '/../outside.svg']) {
    assert.equal((await get(review.origin, path)).status, 404, path);
  }
  for (const path of ['/../%2e%2e/.env', '/?token=example', 'http://[']) assert.equal((await get(review.origin, path)).status, 400);
  assert.equal((await get(review.origin, '/', {headers:{Host:'attacker.invalid'}})).status, 403);
  assert.equal((await get(review.origin, '/', {headers:{Origin:'https://attacker.invalid'}})).status, 403);
  assert.equal((await get(review.origin, '/', {method:'POST'})).status, 405);
  assert.equal((await get(review.origin, '/', {method:'HEAD'})).body.length, 0);
  const download = await get(review.origin, '/rio/download');
  assert.equal(download.headers['content-type'], 'application/octet-stream');
  assert.match(download.headers['content-disposition'], /^attachment;/);
  assert.deepEqual(download.body, readFileSync(resolve(paths.directory, 'rio/download')));
  assert.equal((await get(review.origin, '/sw.js')).headers['service-worker-allowed'], '/');
  assert.equal((await get(review.origin, '/rio/sw.js')).headers['service-worker-allowed'], '/rio/');
  for (const path of ['/rio/', '/rio/reception/']) assert.equal((await get(review.origin, path)).status, 200);
  writeFileSync(resolve(paths.directory, 'index.html'), 'changed after verification');
  assert.deepEqual((await get(review.origin, '/')).body, home.body);
});

test('occupied fixed port fails without silently changing browser storage origin', async t => {
  const paths = fixture(), first = await startReviewServer({...paths, port:0});
  t.after(() => first.close());
  await assert.rejects(startReviewServer({...paths, port:Number(new URL(first.origin).port)}), {code:'EADDRINUSE'});
  for (const port of [-1, 65536, '4173', 0.5]) await assert.rejects(startReviewServer({...paths, port}), /INVALID_PORT/);
});
