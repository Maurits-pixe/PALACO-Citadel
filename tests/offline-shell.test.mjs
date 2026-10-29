import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../offline.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const origin = 'https://citadel.example';

class MockRequest {
  constructor(input, options = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = options.method ?? input.method ?? 'GET';
    this.mode = options.mode ?? input.mode ?? 'navigate';
  }
}
class MockResponse {
  constructor(body, { status = 200, control = '', redirected = false, type = 'basic' } = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.redirected = redirected;
    this.type = type;
    this.headers = { get: (key) => key === 'cache-control' ? control : null };
  }
  clone() { return this; }
  static error() { return new MockResponse('network-error', { status: 0, type: 'error' }); }
}

function harness({ offline = false, responseOptions = {} } = {}) {
  const listeners = new Map(), stored = new Map(), deleted = [];
  const networkCalls = [];
  let skipped = 0, claimed = 0;
  const cache = {
    addAll: async (assets) => { for (const asset of assets) stored.set(asset, new MockResponse('cached:' + asset)); },
    match: async (path) => stored.get(path),
    put: async (path, response) => { stored.set(path, response); }
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['palaco-rio-shell-v5', 'palaco-rio-shell-v6', 'other-app-cache'],
    delete: async (name) => { deleted.push(name); return true; }
  };
  const self = {
    location: { origin },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => { skipped++; },
    clients: { claim: async () => { claimed++; } }
  };
  async function fetch(request) {
    networkCalls.push(request.url);
    if (offline) throw new Error('OFFLINE');
    return new MockResponse('fresh:' + new URL(request.url).pathname, responseOptions);
  }
  runInNewContext(source, { self, caches, fetch, Request: MockRequest, Response: MockResponse, URL });
  const dispatch = (name, request) => {
    let promise;
    listeners.get(name)({ request, waitUntil: (value) => { promise = value; }, respondWith: (value) => { promise = value; } });
    return promise;
  };
  return {
    install: () => dispatch('install'), activate: () => dispatch('activate'),
    request: (pathname, mode = 'navigate', method = 'GET', host = origin) =>
      dispatch('fetch', new MockRequest(host + pathname, { mode, method })),
    stored, deleted, networkCalls,
    counters: () => ({ skipped, claimed })
  };
}

test('installation precaches the complete public shell, including an offline page', async () => {
  const h = harness();
  await h.install();
  assert.equal(h.stored.get('/offline.html').body, 'cached:/offline.html');
  assert.equal(h.stored.get('/index.html').body, 'cached:/index.html');
  assert.equal(h.counters().skipped, 1);
  assert.ok(![...h.stored.keys()].some((key) => /api|auth|account|private/.test(key)));
});

test('public shell remains readable when the network fails', async () => {
  const h = harness({ offline: true });
  await h.install();
  assert.equal((await h.request('/index.html')).body, 'cached:/index.html');
  assert.equal((await h.request('/styles.css', 'same-origin')).body, 'cached:/styles.css');
});

test('unknown public navigation shows an honest local offline page, never an invented page', async () => {
  const h = harness({ offline: true });
  await h.install();
  assert.equal((await h.request('/some-new-public-page')).body, 'cached:/offline.html');
});

test('API, authentication, RIO, registration, foreign origins and writes bypass offline interception', async () => {
  const h = harness({ offline: true });
  await h.install();
  for (const path of ['/api/status', '/auth/login', '/account', '/registration/verify', '/rio/private', '/.well-known/config', '/login', '/oauth/callback', '/session', '/permissions/update']) {
    assert.equal(h.request(path), undefined, path);
  }
  assert.equal(h.request('/index.html', 'navigate', 'POST'), undefined);
  assert.equal(h.request('/index.html', 'navigate', 'GET', 'https://other.example'), undefined);
  assert.equal(h.networkCalls.length, 0);
});

test('online public responses can refresh the shell but private, redirected or opaque responses cannot', async () => {
  for (const responseOptions of [{}, { control: 'private, max-age=0' }, { control: 'no-store' }, { redirected: true }, { type: 'opaque' }]) {
    const h = harness({ responseOptions });
    await h.install();
    const result = await h.request('/index.html');
    assert.equal(result.body, 'fresh:/index.html');
    assert.equal(h.stored.get('/index.html').body, Object.keys(responseOptions).length ? 'cached:/index.html' : 'fresh:/index.html');
  }
});

test('activation clears only old PALACO shell caches', async () => {
  const h = harness();
  await h.activate();
  assert.deepEqual(h.deleted, ['palaco-rio-shell-v5']);
  assert.equal(h.counters().claimed, 1);
});

test('offline page supports twelve languages and clearly states the access boundary', () => {
  for (const code of ['nl','en','de','fr','es','it','pt','ru','eo','pl','ar','zh']) {
    assert.match(page, new RegExp('\\b' + code + ':\\['));
  }
  assert.match(page, /document\.documentElement\.dir=language==='ar'\?'rtl':'ltr'/);
  assert.match(page, /geen toegang of bevoegdheid/);
  assert.doesNotMatch(page, /fetch\(|service_role|\bapi_key\b/);
});

test('connectivity display never fabricates a remote synchronization receipt', () => {
  assert.match(app, /updateConnectivity/);
  assert.match(app, /No server synchronization is connected/);
  assert.doesNotMatch(app, /localStorage\.setItem\('palaco-last-sync'/);
});
