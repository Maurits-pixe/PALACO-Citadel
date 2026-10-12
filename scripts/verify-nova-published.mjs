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

function consent(receipt) {
  check(receipt.status === 'FIRST_ACCEPTED' && receipt.resumeTo === null);
  check(receipt.firstAcceptance !== null && typeof receipt.firstAcceptance === 'object');
  check(JSON.stringify(Object.keys(receipt.firstAcceptance).sort()) === JSON.stringify(['acceptedAt', 'actor', 'scope']));
  check(receipt.firstAcceptance.scope === 'reception-only');
  check(receipt.firstAcceptance.actor === 'browser-test-session');
  check(Number.isFinite(Date.parse(receipt.firstAcceptance.acceptedAt)));
  check(Date.parse(receipt.firstAcceptance.acceptedAt) >= Date.parse(receipt.createdAt));
  check(Date.parse(receipt.firstAcceptance.acceptedAt) <= Date.parse(receipt.expiresAt));
}

function noConsent(receipt) {
  check(receipt.checkGate === null);
  check(receipt.firstAcceptance === null && receipt.resumeTo === null);
}


const GUARD_ROLES = ['IDENTITY', 'ADDRESS', 'HUMAN_CONSENT', 'SCOPE_POLICY', 'E2EE_KEYS', 'CONTENT_INTEGRITY', 'REPLAY_ORDER', 'PRIVACY', 'DELIVERY_REVOCATION'];
function gateMatches(receipt) {
  const gate = receipt.checkGate;
  consent(receipt);
  check(gate !== null && typeof gate === 'object');
  check(gate.schemaVersion === 'nova-check-gate/0.1' && gate.policyVersion === 'NOVA-CHECK-GATE-0.1');
  check(gate.receiptId === receipt.id && gate.currentRevision === receipt.revision);
  check(gate.receptionAcceptedAt === receipt.firstAcceptance.acceptedAt && gate.scope === 'reception-only');
  check(gate.expiresAt === receipt.expiresAt);
  check(Number.isFinite(Date.parse(gate.evaluatedAt)) && Date.parse(gate.evaluatedAt) < Date.parse(gate.expiresAt));
  check(gate.outcome === 'HOLD' && gate.reason === 'CONNECTIONS_MISSING');
  check(gate.steward === 'UNKNOWN' && gate.canOpenContact === false && gate.finalConsentEnabled === false);
  check(Object.keys(gate.localChecks).length === 4);
  for (const local of ['session', 'receptionChoice', 'scope', 'expiry']) check(gate.localChecks[local] === 'CONFIRMED');
  check(gate.guards.length === 9);
  for (let index = 0; index < GUARD_ROLES.length; index += 1) {
    const guard = gate.guards[index];
    check(Object.keys(guard).length === 4);
    check(guard.id === '6RI9ADE-BG-' + String(index + 1).padStart(2, '0') && guard.roleCode === GUARD_ROLES[index]);
    check(guard.sender === 'UNKNOWN' && guard.receiver === 'UNKNOWN');
  }
  check(Object.keys(gate.sourceBinding).length === 4);
  check(gate.sourceBinding.repository === 'Maurits-pixe/PALACO-Citadel');
  check(gate.sourceBinding.commit === '74dcf9535733af2f37a729b3a11f2269d5d594db');
  check(gate.sourceBinding.path === 'rio/brigade-specialties.json');
  check(gate.sourceBinding.blobSha === 'd938ba81c91b48704d566a448af87f0f0c2465bd');
  check(!Object.hasOwn(receipt, 'checkGateBinding') && !Object.hasOwn(receipt, 'sessionId'));
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

async function action(session, receipt, actionName, expected = 200) {
  const { data } = await call('/requests/' + receipt.id + '/actions', {
    method: 'POST', session, expected, body: { action: actionName, revision: receipt.revision },
  });
  if (expected === 200) {
    check(data.request.id === receipt.id);
    check(data.request.revision === receipt.revision + 1);
    check(data.request.expiresAt === receipt.expiresAt);
  }
  return data;
}

let failed = false;
try {
  await step('running-component', async () => {
    const { data } = await call('/runtime');
    check(data.running === true && data.component === 'NOVA_RECEPTION' && data.version === '0.3');
    check(data.storage === 'volatile-memory' && data.chatEnabled === false);
    check(data.receptionEnabled === true && data.firstAcceptanceEnabled === true);
    check(data.checkGateEnabled === true && data.guardianRuntimeConnected === false && data.stewardRuntimeConnected === false);
    check(data.finalConsentEnabled === false);
    check(data.sessionTtlSeconds === 900 && data.requestTtlSeconds === 300);
  });
  await step('auth-safety-approval-required', async () => {
    const response = await fetch(ORIGIN + '/api/auth/status', {
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    check(response.status === 200);
    check((response.headers.get('cache-control') || '').includes('no-store'));
    const status = await response.json();
    check(status.available === false && status.authenticated === false && !Object.hasOwn(status, 'seat'));
    const approval = status.securityApproval;
    check(approval && Object.keys(approval).length === 6 && approval.required === true);
    check(approval.available === false && approval.outcome === 'HOLD');
    check(approval.reason === 'TRUSTED_SAFETY_APPROVAL_MISSING');
    check(approval.loginAllowed === false && approval.signupAllowed === false);
    for (const path of ['/login?seat=PALACO-AMB-01&approval=PASS', '/signup?seat=PALACO-AMB-01&approval=PASS',
      '/callback?code=forged&state=PASS', '/api/me']) {
      const denied = await fetch(ORIGIN + path, {
        redirect: 'manual', headers: { 'X-Safety-Approval': 'PASS' }, signal: AbortSignal.timeout(20000),
      });
      check(denied.status === 503 && denied.headers.get('location') === null);
      check((denied.headers.get('cache-control') || '').includes('no-store'));
      check((await denied.json()).error === 'SAFETY_APPROVAL_REQUIRED');
    }
  });
  const a = await step('session-a', bootstrap);
  const b = await step('session-b', bootstrap);
  check(a.cookie !== b.cookie && a.token !== b.token);
  let receipt = await step('receive', async () => {
    const { data } = await call('/requests', {
      method: 'POST', session: a, expected: 201, body: { text: payload, idempotencyKey },
    });
    check(data.replayed === false && /^[a-f0-9]{32}$/.test(data.request.id));
    check(data.request.status === 'RECEIVED' && data.request.revision === 1);
    check(Date.parse(data.request.expiresAt) - Date.parse(data.request.createdAt) === 300000);
    noConsent(data.request);
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
    for (const actionName of ['withdraw', 'to_reception', 'accept', 'refuse', 'request_checks']) {
      const attempted = await action(b, receipt, actionName, 404);
      check(attempted.error === 'NOVA_REQUEST_NOT_FOUND');
    }
  });
  receipt = await step('hold', async () => {
    const data = await action(a, receipt, 'hold');
    check(data.request.status === 'ON_HOLD' && data.request.resumeTo === 'RECEIVED' && data.request.firstAcceptance === null);
    return data.request;
  });
  receipt = await step('resume', async () => {
    const data = await action(a, receipt, 'resume');
    check(data.request.status === 'RECEIVED');
    noConsent(data.request);
    return data.request;
  });
  await step('no-skipped-acceptance', async () => {
    const denied = await action(a, receipt, 'accept', 409);
    check(denied.error === 'NOVA_INVALID_TRANSITION');
  });
  receipt = await step('to-reception', async () => {
    const data = await action(a, receipt, 'to_reception');
    check(data.request.status === 'AT_RECEPTION');
    noConsent(data.request);
    return data.request;
  });
  receipt = await step('first-acceptance', async () => {
    const data = await action(a, receipt, 'accept');
    consent(data.request);
    const reread = await call('/requests', { session: a });
    check(JSON.stringify(reread.data.requests[0].firstAcceptance) === JSON.stringify(data.request.firstAcceptance));
    return data.request;
  });
  receipt = await step('server-check-gate', async () => {
    const acceptedBefore = receipt.firstAcceptance;
    const data = await action(a, receipt, 'request_checks');
    gateMatches(data.request);
    check(JSON.stringify(data.request.firstAcceptance) === JSON.stringify(acceptedBefore));
    const reread = await call('/requests', { session: a });
    check(JSON.stringify(reread.data.requests[0].checkGate) === JSON.stringify(data.request.checkGate));
    return data.request;
  });
  receipt = await step('repeat-check-gate-binding', async () => {
    const data = await action(a, receipt, 'request_checks');
    gateMatches(data.request);
    check(data.request.checkGate.currentRevision > receipt.checkGate.currentRevision);
    check(JSON.stringify(data.request.firstAcceptance) === JSON.stringify(receipt.firstAcceptance));
    const spoof = await call('/requests/' + data.request.id + '/actions', {
      method: 'POST', session: a, expected: 400,
      body: { action: 'request_checks', revision: data.request.revision, outcome: 'PASS', canOpenContact: true },
    });
    check(spoof.data.error === 'NOVA_INVALID_BODY');
    const foreign = await action(b, data.request, 'request_checks', 404);
    check(foreign.error === 'NOVA_REQUEST_NOT_FOUND');
    return data.request;
  });
  await step('no-chat-authority', async () => {
    const denied = await action(a, receipt, 'open', 400);
    check(denied.error === 'NOVA_INVALID_BODY');
    await call('/requests/' + receipt.id + '/open', { method: 'POST', session: a, body: {}, expected: 404 });
    const { data } = await call('/runtime');
    check(data.chatEnabled === false);
  });
  receipt = await step('hold-revokes-acceptance', async () => {
    const data = await action(a, receipt, 'hold');
    check(data.request.status === 'ON_HOLD' && data.request.resumeTo === 'AT_RECEPTION' && data.request.firstAcceptance === null && data.request.checkGate === null);
    return data.request;
  });
  receipt = await step('resume-needs-new-acceptance', async () => {
    const data = await action(a, receipt, 'resume');
    check(data.request.status === 'AT_RECEPTION');
    noConsent(data.request);
    return data.request;
  });
  receipt = await step('fresh-acceptance', async () => {
    const data = await action(a, receipt, 'accept');
    consent(data.request);
    check(data.request.checkGate === null);
    return data.request;
  });
  receipt = await step('fresh-check-gate', async () => {
    const data = await action(a, receipt, 'request_checks');
    gateMatches(data.request);
    return data.request;
  });
  receipt = await step('withdraw-and-scrub', async () => {
    const data = await action(a, receipt, 'withdraw');
    check(data.request.status === 'WITHDRAWN' && data.request.text === '');
    noConsent(data.request);
    const reread = await call('/requests', { session: a });
    check(reread.data.requests.length === 1 && reread.data.requests[0].text === '');
    noConsent(reread.data.requests[0]);
    const replay = await call('/requests', {
      method: 'POST', session: a, expected: 410, body: { text: payload, idempotencyKey },
    });
    check(replay.data.error === 'NOVA_REQUEST_CLOSED');
    return data.request;
  });
  await step('refuse-and-scrub', async () => {
    const refusedKey = randomBytes(16).toString('hex');
    const refusedText = 'Fictieve gepubliceerde NOVA-weigeringsproef.';
    const created = await call('/requests', {
      method: 'POST', session: a, expected: 201, body: { text: refusedText, idempotencyKey: refusedKey },
    });
    const reception = (await action(a, created.data.request, 'to_reception')).request;
    const refused = (await action(a, reception, 'refuse')).request;
    check(refused.status === 'REFUSED' && refused.text === '');
    noConsent(refused);
    const replay = await call('/requests', {
      method: 'POST', session: a, expected: 410, body: { text: refusedText, idempotencyKey: refusedKey },
    });
    check(replay.data.error === 'NOVA_REQUEST_CLOSED');
    await action(a, refused, 'accept', 410);
    const { data } = await call('/requests', { session: a });
    check(data.requests.length === 2);
    check(data.requests.every(item => item.text === '' && item.firstAcceptance === null && item.resumeTo === null && item.checkGate === null));
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
    if (!session.ended) {
      try {
        await finish(session);
        console.log('NOVA_PUBLISHED cleanup PASS');
      } catch {
        failed = true;
        console.error('NOVA_PUBLISHED cleanup FAIL');
      }
    }
    session.cookie = '';
    session.token = '';
  }
}
if (failed) process.exitCode = 1;
