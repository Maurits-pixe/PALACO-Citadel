import assert from 'node:assert/strict';
import test from 'node:test';
import {
  METADATA_PATH,
  VERIFICATION_TIMEOUT_MS,
  VERIFICATION_TTL_MS,
  commitIfCurrent,
  createRequestGuard,
  getEvidenceStatus,
  isOriginApproved,
  normalizeApprovedOrigin,
  parseHttpsUrl,
  verifyModuleMetadata
} from './verification.js';

const origin = 'https://aether.example.test:8443';
const url = origin;
const goodMetadata = {
  appId: 'aether',
  version: '1.0.0',
  status: 'operational'
};

function jsonResponse(metadata, status = 200) {
  return new Response(JSON.stringify(metadata), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

test('normalizes and compares approved HTTPS origins including explicit ports', () => {
  assert.equal(normalizeApprovedOrigin(origin), origin);
  assert.equal(normalizeApprovedOrigin('https://aether.example.test:8443/path'), null);
  assert.equal(normalizeApprovedOrigin('http://aether.example.test:8443'), null);
  assert.equal(isOriginApproved(url, origin), true);
  assert.equal(parseHttpsUrl('https://aether.example.test:8443/somepath'), null);
  assert.equal(parseHttpsUrl('https://aether.example.test:8443?query=value'), null);
  assert.equal(parseHttpsUrl('https://aether.example.test:8443#fragment'), null);
  assert.equal(isOriginApproved('https://aether.example.test:8443/somepath', origin), false);
  assert.equal(isOriginApproved('https://aether.example.test', origin), false);
  assert.equal(isOriginApproved('https://user@aether.example.test:8443', origin), false);
});

test('confirms only expected schema-valid metadata from the approved origin', async () => {
  let requestedUrl;
  let options;
  const outcome = await verifyModuleMetadata(url, 'aether', origin, {
    fetchImpl: async (requestUrl, requestOptions) => {
      requestedUrl = requestUrl.href;
      options = requestOptions;
      return jsonResponse(goodMetadata);
    },
    now: () => 1000
  });

  assert.equal(outcome.status, 'metadata-confirmed');
  assert.equal(outcome.origin, origin);
  assert.equal(outcome.expectedAppId, 'aether');
  assert.equal(outcome.receivedAppId, 'aether');
  assert.equal(outcome.checkedAt, 1000);
  assert.equal(typeof outcome.durationMs, 'number');
  assert.ok(outcome.durationMs >= 0);
  assert.equal(outcome.expiresAt, 1000 + VERIFICATION_TTL_MS);
  assert.equal(requestedUrl, `${origin}${METADATA_PATH}`);
  assert.equal(options.method, 'GET');
  assert.equal(options.mode, 'cors');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
});

test('reports browser-measured metadata request and body-read duration', async () => {
  let tick = 0;
  const outcome = await verifyModuleMetadata(url, 'aether', origin, {
    fetchImpl: async () => jsonResponse(goodMetadata),
    monotonicNow: () => (tick++ === 0 ? 100 : 112.4)
  });

  assert.equal(outcome.durationMs, 12);
});

test('uses the canonical 5criptie appId independently from its launcher key', async () => {
  const outcome = await verifyModuleMetadata(url, '5criptie', origin, {
    fetchImpl: async () => jsonResponse({
      appId: '5criptie',
      version: '1.0.0',
      status: 'maintenance'
    })
  });
  assert.equal(outcome.status, 'metadata-confirmed');
  assert.equal(outcome.expectedAppId, '5criptie');
  assert.equal(outcome.reportedStatus, 'maintenance');
});

test('does not request an origin that is not explicitly approved', async () => {
  let requestCount = 0;
  const outcome = await verifyModuleMetadata(url, 'aether', 'https://other.example.test', {
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse(goodMetadata);
    }
  });
  assert.equal(outcome.status, 'destination-unapproved');
  assert.equal(outcome.reason, 'destination_unapproved');
  assert.equal(requestCount, 0);
});

test('rejects absent, wrong, and unexpected app identities', async t => {
  for (const [name, metadata] of [
    ['missing appId', { version: '1.0.0', status: 'operational' }],
    ['wrong appId', { ...goodMetadata, appId: 'bastion' }],
    ['unknown appId', { ...goodMetadata, appId: 'other' }]
  ]) {
    await t.test(name, async () => {
      const outcome = await verifyModuleMetadata(url, 'aether', origin, {
        fetchImpl: async () => jsonResponse(metadata)
      });
      assert.equal(outcome.status, 'verification-failed');
      assert.equal(outcome.reason, 'wrong_identity');
    });
  }
});

test('rejects invalid JSON, missing schema fields, invalid status, and non-JSON content type', async t => {
  const cases = [
    ['malformed JSON', new Response('{', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['unreadable body', new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError('body read failed'));
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } })],
    ['missing version', jsonResponse({ appId: 'aether', status: 'operational' })],
    ['missing status', jsonResponse({ appId: 'aether', version: '1.0.0' })],
    ['invalid version', jsonResponse({ ...goodMetadata, version: 'latest' })],
    ['invalid status', jsonResponse({ ...goodMetadata, status: 'unknown' })],
    ['unexpected field', jsonResponse({ ...goodMetadata, owner: 'unknown' })],
    ['oversized body', new Response(JSON.stringify({ ...goodMetadata, note: 'x'.repeat(17 * 1024) }), { status: 200, headers: { 'content-type': 'application/json' } })],
    ['non-JSON content type', new Response(JSON.stringify(goodMetadata), { status: 200, headers: { 'content-type': 'text/plain' } })]
  ];

  for (const [name, response] of cases) {
    await t.test(name, async () => {
      const outcome = await verifyModuleMetadata(url, 'aether', origin, {
        fetchImpl: async () => response
      });
      assert.equal(outcome.status, 'verification-failed');
      assert.equal(outcome.reason, 'invalid_response');
    });
  }
});

test('rejects every response other than HTTP 200', async () => {
  const outcome = await verifyModuleMetadata(url, 'aether', origin, {
    fetchImpl: async () => jsonResponse(goodMetadata, 503)
  });
  assert.equal(outcome.status, 'verification-failed');
  assert.equal(outcome.reason, 'http_error');
  assert.equal(outcome.httpStatus, 503);
});

test('treats network, CORS, TLS and redirect failures as unavailable', async t => {
  for (const reason of ['network error', 'CORS rejection', 'redirect blocked by fetch']) {
    await t.test(reason, async () => {
      const outcome = await verifyModuleMetadata(url, 'aether', origin, {
        fetchImpl: async (_url, options) => {
          assert.equal(options.redirect, 'error');
          throw new TypeError(reason);
        }
      });
      assert.equal(outcome.status, 'check-unavailable');
      assert.equal(outcome.reason, 'request_unavailable');
    });
  }
});

test('applies the timeout to a pending request and to reading the response body', async t => {
  assert.equal(VERIFICATION_TIMEOUT_MS, 5000);

  await t.test('request timeout', async () => {
    const outcome = await verifyModuleMetadata(url, 'aether', origin, {
      timeoutMs: 5,
      fetchImpl: async () => new Promise(() => {})
    });
    assert.equal(outcome.status, 'check-unavailable');
    assert.equal(outcome.reason, 'timeout');
  });

  await t.test('body timeout', async () => {
    const response = new Response(new ReadableStream({ start() {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    const outcome = await verifyModuleMetadata(url, 'aether', origin, {
      timeoutMs: 5,
      fetchImpl: async () => response
    });
    assert.equal(outcome.status, 'check-unavailable');
    assert.equal(outcome.reason, 'timeout');
  });
});

test('expires successful evidence and retains the checked origin and identity binding', async () => {
  const outcome = await verifyModuleMetadata(url, 'aether', origin, {
    fetchImpl: async () => jsonResponse(goodMetadata),
    now: () => 10_000
  });
  assert.equal(outcome.origin, origin);
  assert.equal(outcome.expectedAppId, 'aether');
  assert.equal(outcome.receivedAppId, 'aether');
  assert.equal(outcome.reportedStatus, 'operational');
  assert.equal(VERIFICATION_TTL_MS, 60_000);
  assert.equal(outcome.expiresAt, outcome.checkedAt + 60_000);
  assert.equal(outcome.endpoint, `${origin}${METADATA_PATH}`);
  assert.equal(outcome.method, 'GET');
  assert.equal(getEvidenceStatus(outcome, outcome.expiresAt - 1), 'metadata-confirmed');
  assert.equal(getEvidenceStatus(outcome, outcome.expiresAt), 'verification-expired');
});

test('invalidates a superseded in-flight request generation', () => {
  const guard = createRequestGuard();
  const oldRun = guard.begin('aether');
  const newRun = guard.begin('aether');
  assert.equal(guard.isCurrent('aether', oldRun), false);
  assert.equal(guard.isCurrent('aether', newRun), true);
});

test('does not commit an old response after its saved URL changes', () => {
  const guard = createRequestGuard();
  const oldRun = guard.begin('aether');
  const results = [];
  const committed = commitIfCurrent({
    guard,
    id: 'aether',
    generation: oldRun,
    currentUrl: 'https://new.example.test',
    expectedUrl: 'https://old.example.test',
    value: { status: 'metadata-confirmed' },
    commit: value => results.push(value)
  });
  assert.equal(committed, false);
  assert.deepEqual(results, []);
});

test('a later URL check wins even when an earlier response completes afterwards', async () => {
  const guard = createRequestGuard();
  const results = [];
  const oldGeneration = guard.begin('aether');
  const oldResponse = new Promise(resolve => {
    setTimeout(() => {
      resolve(commitIfCurrent({
        guard,
        id: 'aether',
        generation: oldGeneration,
        currentUrl: 'https://new.example.test',
        expectedUrl: 'https://old.example.test',
        value: 'old result',
        commit: value => results.push(value)
      }));
    }, 10);
  });

  const newGeneration = guard.begin('aether');
  const newCommitted = commitIfCurrent({
    guard,
    id: 'aether',
    generation: newGeneration,
    currentUrl: 'https://new.example.test',
    expectedUrl: 'https://new.example.test',
    value: 'new result',
    commit: value => results.push(value)
  });

  assert.equal(newCommitted, true);
  assert.equal(await oldResponse, false);
  assert.deepEqual(results, ['new result']);
});
