import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'Observatorium has inline JavaScript');

// Select exactly the functions used by the browser, rather than reimplementing the
// algorithm in the tests. An unmatched function declaration fails the build.
function extractDeclaration(name) {
  const marker = 'function ' + name + '(';
  let begin = inline.indexOf(marker);
  assert.ok(begin >= 0, 'Missing browser function: ' + name);
  // Keep the async keyword: digestContent awaits WebCrypto SHA-256.
  if (inline.slice(Math.max(0, begin - 6), begin) === 'async ') begin -= 6;
  const brace = inline.indexOf('{', begin);
  assert.ok(brace >= 0);
  let depth = 0, quoted = null, escaped = false;
  for (let i = brace; i < inline.length; i++) {
    const c = inline[i];
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quoted) quoted = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quoted = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return inline.slice(begin, i + 1);
  }
  throw new Error('Unterminated browser function: ' + name);
}

const functions = ['valid','inspectionContent','ownKeysEqual','digestContent','validateDossier']
  .map(extractDeclaration).join('\n');
const api = runInNewContext(functions + '\n({valid,inspectionContent,ownKeysEqual,digestContent,validateDossier})',
  {crypto: webcrypto, TextEncoder}, {timeout: 2000});

const observation = {
  id: 'local-001',
  at: '2026-11-17T05:00:00.000Z',
  subject: 'Offline source check',
  kind: 'OBSERVED',
  reference: 'QUAY: demo',
  notes: 'Local fixture without external authority'
};

function packet(digest) {
  const content = api.inspectionContent(observation);
  return { ...structuredClone(content),
    integrity: {algorithm:'SHA-256',scope:'UTF8_JSON_STRINGIFY_CONTENT_V1',
      digest,meaning:'INTEGRITY_ONLY_NOT_AUTHENTICITY'} };
}

test('unmodified exported dossier passes schema and SHA-256 check', async () => {
  const digest = await api.digestContent(api.inspectionContent(observation));
  const file = packet(digest);
  assert.equal(api.validateDossier(file), true);
  assert.equal(await api.digestContent(api.inspectionContent(file.observation)),file.integrity.digest);
  assert.equal(file.verification.authority,'NONE');
  assert.equal(file.source_status,'SELF_REPORTED_NOT_VERIFIED');
});

test('tampered observation is detected by unchanged hash', async () => {
  const file = packet(await api.digestContent(api.inspectionContent(observation)));
  file.observation.notes = 'Manipulated contents';
  assert.equal(api.validateDossier(file), true, 'Shape alone cannot establish integrity');
  assert.notEqual(await api.digestContent(api.inspectionContent(file.observation)),file.integrity.digest);
});

test('modified digest is rejected by recomputation', async () => {
  const file = packet(await api.digestContent(api.inspectionContent(observation)));
  file.integrity.digest = '0'.repeat(64);
  assert.notEqual(await api.digestContent(api.inspectionContent(file.observation)),file.integrity.digest);
});

test('authority or verification escalation fails closed', async () => {
  const file = packet(await api.digestContent(api.inspectionContent(observation)));
  file.verification.authority = 'OWNER';
  assert.equal(api.validateDossier(file), false);
  file.verification.authority = 'NONE';
  file.verification.watermerk = 'VALID';
  assert.equal(api.validateDossier(file), false);
});

test('unknown envelope field and malformed source are rejected', async () => {
  const file = packet(await api.digestContent(api.inspectionContent(observation)));
  file.extra = true;
  assert.equal(api.validateDossier(file), false);
  delete file.extra;
  file.observation.id = '';
  assert.equal(api.validateDossier(file), false);
});

test('rehashed forged content is still unverified, never authentic', async () => {
  const forged = {...observation,notes:'Entirely recreated by a different party'};
  const body = api.inspectionContent(forged);
  const file = {...structuredClone(body), integrity:{
    algorithm:'SHA-256',scope:'UTF8_JSON_STRINGIFY_CONTENT_V1',
    digest:await api.digestContent(body),meaning:'INTEGRITY_ONLY_NOT_AUTHENTICITY'
  }};
  assert.equal(api.validateDossier(file), true);
  assert.equal(file.source_status, 'SELF_REPORTED_NOT_VERIFIED');
  assert.equal(file.verification.authority, 'NONE');
  // No source authenticity is established; this test explicitly documents the limit.
});
