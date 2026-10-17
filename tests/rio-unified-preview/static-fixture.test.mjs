import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { startStaticFixture } from './static-fixture.mjs';

function get(origin, target) {
  const base = new URL(origin);
  return new Promise((resolve, reject) => {
    // Use a raw HTTP request target: fetch/URL would reject it on the client and
    // never exercise the fixture's handling of a malformed absolute-form URL.
    const req = request({ hostname: base.hostname, port: base.port, path: target, method: 'GET', agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('FIXTURE_REQUEST_TIMED_OUT')));
    req.once('error', reject);
    req.end();
  });
}

test('malformed absolute URLs and bad encoding are closed responses and leave the fixture usable', { timeout: 10000 }, async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rio-static-fixture-')));
  let fixture;
  t.after(async () => {
    if (fixture) await fixture.close();
    const actual = await realpath(directory), base = await realpath(tmpdir());
    assert.ok(actual === directory && actual.startsWith(base + sep)
      && basename(actual).startsWith('rio-static-fixture-'));
    await rm(actual, { recursive: true, force: true });
  });
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Local review</title>');
  fixture = await startStaticFixture(directory);

  for (const target of ['http://[', 'http://fixture.invalid:bad/', '/%E0%A4%A']) {
    const invalid = await get(fixture.origin, target);
    assert.equal(invalid.status, 404, target);
    assert.equal(invalid.body, '', target);
    assert.equal(invalid.headers['cache-control'], 'no-store');
    assert.equal(invalid.headers['x-content-type-options'], 'nosniff');
    assert.ok(invalid.headers['content-security-policy'].includes("default-src 'self'"));
    const healthy = await get(fixture.origin, '/');
    assert.equal(healthy.status, 200);
    assert.equal(healthy.body, '<!doctype html><title>Local review</title>');
  }
});
