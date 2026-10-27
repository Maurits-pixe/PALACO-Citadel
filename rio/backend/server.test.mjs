import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {request} from 'node:http';
import {connect} from 'node:net';
import {once} from 'node:events';
import {buildUnifiedPreview, OUTPUT_FILES} from '../../scripts/build-rio-unified-preview.mjs';
import {REVIEW_CSP} from '../../scripts/serve-rio-unified-preview.mjs';
import {readConfiguration, startRioBackendServer} from './server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const record = buildUnifiedPreview();
const temporary = realpathSync(mkdtempSync(resolve(tmpdir(), 'rio-account-server-')));
const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_synthetic_test_key_not_a_cloud_credential';
const configured = () => readConfiguration({NODE_ENV:'test', RIO_SUPABASE_URL:SUPABASE_URL,
  RIO_SUPABASE_PUBLISHABLE_KEY:PUBLISHABLE_KEY});
let index = 0;
after(() => {
  const actual = realpathSync(temporary), base = realpathSync(tmpdir());
  assert.ok(actual.startsWith(base + sep) && actual === temporary);
  rmSync(actual, {recursive:true, force:true});
});
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
async function start(t, options = {}) {
  const backend = await startRioBackendServer({...fixture(), port:0, configuration:readConfiguration({NODE_ENV:'test'}), ...options});
  t.after(() => backend.close());
  return backend;
}

test('missing or incomplete configuration stays closed and exposes only the explicit public contract', async t => {
  for (const env of [{}, {RIO_SUPABASE_URL:SUPABASE_URL}, {RIO_SUPABASE_PUBLISHABLE_KEY:PUBLISHABLE_KEY}]) {
    const backend = await start(t, {configuration:readConfiguration({...env, NODE_ENV:'test'})});
    const result = await get(backend.origin, '/api/rio/backend/config');
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), {provider:'supabase', configured:false, url:null, publishableKey:null});
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['access-control-allow-origin'], undefined);
    assert.deepEqual(JSON.parse((await get(backend.origin, '/healthz')).body), {ok:true});
    assert.equal((await get(backend.origin, '/rio/account/')).headers['content-security-policy'], REVIEW_CSP);
  }
});

test('valid public key and exact Supabase origin are configuration, never a claim of verified connectivity', async t => {
  const backend = await start(t, {configuration:configured()});
  const result = await get(backend.origin, '/api/rio/backend/config');
  assert.deepEqual(JSON.parse(result.body), {provider:'supabase', configured:true, url:SUPABASE_URL, publishableKey:PUBLISHABLE_KEY});
  assert.equal(result.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(Number(result.headers['content-length']), result.body.length);
  assert.doesNotMatch(result.body.toString(), /verified|connected|service_role|secret|session|password/i);
  const head = await get(backend.origin, '/api/rio/backend/config', {method:'HEAD'});
  assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], result.headers['content-length']);
});

test('secret, legacy, malformed and whitespace credentials and non-exact project URLs fail before startup', async () => {
  for (const key of ['sb_secret_never_expose_this', 'eyJhbGciOiJIUzI1NiJ9.synthetic.legacy', 'service_role',
    'sb_publishable_short', PUBLISHABLE_KEY + '\n', ' ' + PUBLISHABLE_KEY, PUBLISHABLE_KEY + '<script>']) {
    assert.throws(() => readConfiguration({RIO_SUPABASE_URL:SUPABASE_URL, RIO_SUPABASE_PUBLISHABLE_KEY:key}), /INVALID_SUPABASE_PUBLISHABLE_KEY/);
  }
  for (const url of ['http://abcdefghijklmnopqrst.supabase.co', SUPABASE_URL + '/', SUPABASE_URL + ':443',
    SUPABASE_URL + '?token=not-allowed', SUPABASE_URL + '#fragment', SUPABASE_URL + '.attacker.invalid',
    'https://user:pass@abcdefghijklmnopqrst.supabase.co', 'https://127.0.0.1', 'https://project.supabase.co',
    'https://ABCDEFGHIJKLMNOPQRST.supabase.co', SUPABASE_URL + '\n']) {
    assert.throws(() => readConfiguration({RIO_SUPABASE_URL:url, RIO_SUPABASE_PUBLISHABLE_KEY:PUBLISHABLE_KEY}), /INVALID_SUPABASE_URL/);
  }
  await assert.rejects(startRioBackendServer({...fixture(), port:0,
    configuration:{provider:'supabase', configured:true, url:SUPABASE_URL, publishableKey:'sb_secret_synthetic'}}), /INVALID_SUPABASE_PUBLISHABLE_KEY/);
  await assert.rejects(startRioBackendServer({...fixture(), port:0,
    configuration:{...configured(), configured:false}}), /INVALID_CONFIGURATION/);
});

test('production requires an exact HTTPS base origin; even production binds only loopback', async t => {
  assert.throws(() => readConfiguration({NODE_ENV:'production'}), /PRODUCTION_BASE_URL_REQUIRED/);
  for (const base of ['http://rio.invalid', 'http://127.0.0.1:4201', 'https://rio.invalid/',
    'https://rio.invalid/path', 'https://rio.invalid?x=y', 'https://user:pass@rio.invalid']) {
    assert.throws(() => readConfiguration({NODE_ENV:'production', RIO_BASE_URL:base}), /INVALID_BASE_URL/);
  }
  assert.throws(() => readConfiguration({RIO_BIND_HOST:'0.0.0.0'}), /LOOPBACK_BIND_REQUIRED/);
  const baseUrl = 'https://rio.example.invalid';
  const backend = await start(t, {configuration:readConfiguration({NODE_ENV:'production', RIO_BASE_URL:baseUrl})});
  assert.equal(backend.publicOrigin, baseUrl);
  assert.equal(new URL(backend.origin).hostname, '127.0.0.1');
  assert.equal((await get(backend.origin, '/healthz')).status, 403);
  assert.equal((await get(backend.origin, '/healthz', {headers:{Host:'rio.example.invalid', Origin:baseUrl}})).status, 200);
  assert.equal((await get(backend.origin, '/healthz', {headers:{Host:'rio.example.invalid', Origin:'https://attacker.invalid'}})).status, 403);
});

test('only the account HTML can contact the configured provider; all other documents and assets keep the static CSP', async t => {
  const backend = await start(t, {configuration:configured()});
  const accountCsp = REVIEW_CSP.replace("connect-src 'self'", "connect-src 'self' " + SUPABASE_URL);
  for (const path of ['/rio/account/', '/rio/account/index.html']) {
    const result = await get(backend.origin, path);
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-security-policy'], accountCsp);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['referrer-policy'], 'no-referrer');
    assert.equal(result.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(result.headers['content-type'], 'text/html; charset=utf-8');
  }
  assert.equal(OUTPUT_FILES.length, 32);
  for (const path of OUTPUT_FILES.filter(path => path !== 'rio/account/index.html')) {
    const result = await get(backend.origin, '/' + path);
    assert.equal(result.status, 200, path);
    assert.equal(result.headers['content-security-policy'], REVIEW_CSP, path);
    assert.equal(result.headers['cache-control'], 'no-store', path);
    assert.deepEqual(result.body, readFileSync(resolve(root, 'render-dist', path)));
  }
});

test('wrong Host and Origin cannot read static bytes, configuration or health, and forwarded headers never grant access', async t => {
  const backend = await start(t);
  for (const path of ['/', '/api/rio/backend/config', '/rio/account/', '/healthz']) {
    for (const headers of [{Host:'attacker.invalid'}, {Origin:'https://attacker.invalid'},
      {Origin:'null'}, {Host:'attacker.invalid', 'X-Forwarded-Host':new URL(backend.origin).host},
      {Host:new URL(backend.origin).host, Origin:backend.origin + '/'}]) {
      assert.equal((await get(backend.origin, path, {headers})).status, 403, path);
    }
    assert.equal((await get(backend.origin, path, {headers:{Origin:backend.origin}})).status, 200);
  }
});

test('no private file, proxy, auth callback or backend source path is served', async t => {
  const backend = await start(t);
  for (const path of ['/.env', '/.env.local', '/rio/backend/.env.local', '/rio/backend/server.mjs',
    '/rio/backend/client.mjs', '/rio/backend/supabase/migrations/202610270001_rio_private_workspace.sql',
    '/rio/account', '/api/rio/backend/secret', '/api/rio/backend/proxy', '/api/rio/backend/auth',
    '/auth/callback', '/build-manifest.json', '/review-server.mjs', '/hara-runtime/.data/household.sqlite']) {
    assert.equal((await get(backend.origin, path)).status, 404, path);
  }
});

test('POST and all other writes are refused on every public route', async t => {
  const backend = await start(t);
  for (const path of ['/', '/rio/account/', '/api/rio/backend/config', '/healthz']) {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const result = await get(backend.origin, path, {method});
      assert.equal(result.status, 405, path + method);
      assert.equal(result.headers.allow, 'GET, HEAD');
    }
    const head = await get(backend.origin, path, {method:'HEAD'});
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  }
});

test('unknown queries, oversized paths, encodings, traversal and absolute-form requests fail closed', async t => {
  const backend = await start(t);
  for (const path of ['/?token=synthetic', '/api/rio/backend/config?token=synthetic', '/rio/account/?code=synthetic',
    '/rio/account/index.html?refresh_token=synthetic', '/rio/?lang=nl&token=synthetic', '/rio/?lang=NL',
    '/rio/?lang=%6el', '/api/rio/backend/%63onfig', '/../.env', '/rio/account/../../.env',
    '//api/rio/backend/config', '/rio/./account/', '/rio/%2e%2e/account/', '/rio\\account',
    '/api/rio/backend/config' + 'a'.repeat(2049), 'https://attacker.invalid/api/rio/backend/config']) {
    assert.equal((await get(backend.origin, path)).status, 400, path);
  }
  for (const lang of ['nl','en','de','fr','es','it','pt','ru','pl','zh','ar','eo']) {
    assert.equal((await get(backend.origin, '/rio/?lang=' + lang)).status, 200);
  }
});

test('WebSocket upgrades never initialize a provider, proxy or live channel', async t => {
  const backend = await start(t, {configuration:configured()});
  const socket = connect(Number(new URL(backend.origin).port), '127.0.0.1');
  await once(socket, 'connect');
  let response = '';
  socket.setEncoding('utf8');
  socket.on('data', chunk => {response += chunk;});
  socket.write('GET /api/rio/backend/config HTTP/1.1\r\nHost: ' + new URL(backend.origin).host
    + '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  await once(socket, 'close');
  assert.match(response, /^HTTP\/1\.1 400 Bad Request/);
  assert.doesNotMatch(response, /sb_publishable_/);
});

test('manifest changes fail before serving, and filesystem changes after startup cannot alter verified bytes', async t => {
  const paths = fixture();
  const bytes = readFileSync(resolve(paths.directory, 'rio/account/index.html'));
  const backend = await startRioBackendServer({...paths, port:0, configuration:configured()});
  t.after(() => backend.close());
  writeFileSync(resolve(paths.directory, 'rio/account/index.html'), 'modified after snapshot');
  assert.deepEqual((await get(backend.origin, '/rio/account/')).body, bytes);
  await assert.rejects(startRioBackendServer({...paths, port:0, configuration:configured()}), /UNSAFE_PUBLIC_FILE|BUILD_HASH_MISMATCH/);
  const badPaths = fixture(), badRecord = structuredClone(record);
  badRecord.files[0].path = 'rio/backend/.env.local';
  writeFileSync(badPaths.manifestPath, JSON.stringify(badRecord));
  await assert.rejects(startRioBackendServer({...badPaths, port:0, configuration:configured()}), /INVALID_BUILD_MANIFEST/);
});

test('invalid or occupied ports fail without moving the browser storage origin', async t => {
  const backend = await start(t);
  await assert.rejects(startRioBackendServer({...fixture(), configuration:configured(), port:Number(new URL(backend.origin).port)}), {code:'EADDRINUSE'});
  for (const port of [-1, 65536, '4201', 0.5]) {
    await assert.rejects(startRioBackendServer({...fixture(), configuration:configured(), port}), /INVALID_PORT/);
  }
});
