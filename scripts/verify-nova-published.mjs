import { randomBytes } from 'node:crypto';

const ORIGIN = 'https://palaco-ambassades.onrender.com';
const API = ORIGIN + '/api/rio/nova';
const sessions = [];
const payload = 'Fictieve gepubliceerde NOVA-ontvangstproef.';
const idempotencyKey = randomBytes(16).toString('hex');
let currentStep = 'start';

function check(condition) {
  if (!condition) throw new Error('NOVA published check failed');
}

async function call(path, { method = 'GET', session, body, expected = 200 } = {}) {
  const headers = {
    ...(method !== 'GET' ? { Origin: ORIGIN, 'Content-Type': 'application/json' } : {}),
    ...(session ? { Cookie: session.cookie } : {}),
    ...(session && method !== 'GET' ? { 'X-NOVA-CSRF': session.token } : {}),
  };
  const response = await fetch(API + path, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(20000),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  check(response.status === expected);
  check((response.headers.get('cache-control') || '').includes('no-store'));
  const data = await response.json();
  return { response, data };
}

async function step(name, operation) {
  currentStep = name;
  const result = await operation();
  console.log('NOVA_PUBLISHED ' + name + ' PASS');
  return result;
}

async function bootstrap() {
  const { response, data } = await call('/session', { method: 'POST', body: {} });
  const raw = response.headers.get('set-cookie') || '';
  check(/^__Host-palacoNova=[a-f0-9]{64};/.test(raw));
  check(/; Secure/i.test(raw) && /; HttpOnly/i.test(raw) && /; SameSite=Strict/i.test(raw));
  check(/; Path=\//i.test(raw) && !/; Domain=/i.test(raw));
  check(/^[a-f0-9]{64}$/.test(data.session.csrfToken));
  check(data.requests.length === 0);
  const session = { cookie: raw.split(';')[0], token: data.session.csrfToken, ended: false };
  sessions.push(session);
  return session;
}

async function finish(session) {
  await call('/session', { method: 'DELETE', session, body: {} });
  session.ended = true;
}

let failed = false;
try {
  await step('running-component', async () => {
    const { data } = await call('/runtime');
    check(data.running === true && data.component === 'NOVA_RECEPTION');
    check(data.storage === 'volatile-memory' && data.chatEnabled === false);
    check(data.sessionTtlSeconds === 900 && data.requestTtlSeconds === 300);
  });
  const a = await step('session-a', bootstrap);
  const b = await step('session-b', bootstrap);
  check(a.cookie !== b.cookie && a.token !== b.token);
  const receipt = await step('receive', async () => {
    const { data } = await call('/requests', {
      method: 'POST', session: a, expected: 201, body: { text: payload, idempotencyKey },
    });
    check(data.replayed === false && /^[a-f0-9]{32}$/.test(data.request.id));
    check(data.request.status === 'RECEIVED' && data.request.revision === 1);
    return data.request;
  });
  await step('server-reread', async () => {
    const { data } = await call('/requests', { session: a });
    check(data.requests.length === 1);
    check(data.requests[0].id === receipt.id && data.requests[0].text === payload);
  });
  await step('isolation', async () => {
    const { data } = await call('/requests', { session: b });
    check(data.requests.length === 0);
    const attempted = await call('/requests/' + receipt.id + '/actions', {
      method: 'POST', session: b, expected: 404, body: { action: 'withdraw', revision: 1 },
    });
    check(attempted.data.error === 'NOVA_REQUEST_NOT_FOUND');
  });
  await step('hold', async () => {
    const { data } = await call('/requests/' + receipt.id + '/actions', {
      method: 'POST', session: a, body: { action: 'hold', revision: 1 },
    });
    check(data.request.status === 'ON_HOLD' && data.request.revision === 2);
  });
  await step('resume', async () => {
    const { data } = await call('/requests/' + receipt.id + '/actions', {
      method: 'POST', session: a, body: { action: 'resume', revision: 2 },
    });
    check(data.request.status === 'RECEIVED' && data.request.revision === 3);
  });
  await step('withdraw-and-scrub', async () => {
    const { data } = await call('/requests/' + receipt.id + '/actions', {
      method: 'POST', session: a, body: { action: 'withdraw', revision: 3 },
    });
    check(data.request.status === 'WITHDRAWN' && data.request.text === '' && data.request.revision === 4);
    const reread = await call('/requests', { session: a });
    check(reread.data.requests.length === 1 && reread.data.requests[0].text === '');
    const replay = await call('/requests', {
      method: 'POST', session: a, expected: 410, body: { text: payload, idempotencyKey },
    });
    check(replay.data.error === 'NOVA_REQUEST_CLOSED');
  });
  await step('end-and-invalidate', async () => {
    await finish(a);
    await finish(b);
    const deniedA = await call('/requests', { session: a, expected: 401 });
    const deniedB = await call('/requests', { session: b, expected: 401 });
    check(deniedA.data.error === 'NOVA_SESSION_REQUIRED' && deniedB.data.error === 'NOVA_SESSION_REQUIRED');
  });
} catch {
  failed = true;
  console.error('NOVA_PUBLISHED ' + currentStep + ' FAIL');
} finally {
  for (const session of sessions) {
    if (session.ended) continue;
    try {
      await finish(session);
      console.log('NOVA_PUBLISHED cleanup PASS');
    } catch {
      failed = true;
      console.error('NOVA_PUBLISHED cleanup FAIL');
    }
    session.cookie = '';
    session.token = '';
  }
}
if (failed) process.exitCode = 1;
