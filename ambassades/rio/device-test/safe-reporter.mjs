import { mkdir, writeFile } from 'node:fs/promises';

const CASES = {
  'RIO-DEVICE-01': 'Two browser sessions exchange, acknowledge and close generated test codes',
  'RIO-DEVICE-02': 'Both sessions must accept and only the recipient can acknowledge',
  'RIO-DEVICE-03': 'Retry after a lost real response does not duplicate a challenge',
  'RIO-DEVICE-04': 'A lost invitation is not recovered or published on replay',
  'RIO-DEVICE-05': 'Expired codes disappear even while the browser is offline',
  'RIO-DEVICE-06': 'Mobile setup declarations gate acceptance and reset for a new pair',
  'RIO-DEVICE-07': 'Declared mobile pair exchanges codes and exports only a bounded receipt',
  'RIO-DEVICE-08': 'A malformed receipt cannot be displayed or downloaded as account authority',
};
const PHASES = new Set([
  'setup', 'invitation', 'fragment-and-storage', 'bilateral-acceptance',
  'challenge', 'recipient-ack', 'reply', 'return-ack', 'third-session-denied',
  'close', 'closed-account-gates', 'mobile-layout', 'lost-response',
  'idempotent-retry', 'invitation-not-recoverable', 'offline-expiry',
  'network-declaration', 'carrier-evidence', 'receipt-download', 'new-pair-reset', 'invalid-receipt',
]);

// URLs, invitation capabilities, cookies, CSRF values and codes never enter evidence.
export default class DeviceTestReporter {
  tests = [];
  suiteErrors = 0;
  printsToStdio() { return true; }
  onStdOut() {}
  onStdErr() {}
  onError() { this.suiteErrors += 1; }
  onTestEnd(test, result) {
    const id = /^\[(RIO-DEVICE-0[1-8])\]/.exec(test.title)?.[1] ?? 'UNKNOWN';
    const projectName = test.parent.project()?.name;
    const project = ['mobile', 'desktop'].includes(projectName) ? projectName : 'unknown';
    const lines = new Set(), phases = [];
    const walk = steps => {
      for (const step of steps) {
        if (step.error && Number.isInteger(step.location?.line)) lines.add(step.location.line);
        if (step.category === 'test.step' && PHASES.has(step.title)) {
          phases.push({ name: step.title, status: step.error ? 'failed' : 'passed' });
        }
        walk(step.steps ?? []);
      }
    };
    walk(result.steps);
    const row = {
      id, title: CASES[id] ?? 'Unexpected case', project,
      status: result.status, durationMs: Math.round(result.duration),
      failedSourceLines: [...lines].sort((a, b) => a - b), phases,
    };
    this.tests.push(row);
    process.stdout.write(id + '/' + project + ': ' + row.status +
      (row.failedSourceLines.length ? ' (source lines ' + row.failedSourceLines.join(',') + ')' : '') + '\n');
  }
  async onEnd(result) {
    const summary = {
      schema: 'rio-device-test-browser-evidence/v1', status: result.status,
      suiteErrors: this.suiteErrors, transport: 'real-http-test-server',
      deviceEvidence: 'separate-browser-contexts-mobile-viewport-and-desktop',
      physicalPhonesVerified: false, generatedCodesOnly: true,
      accounts: 'CLOSED', novaContact: 'HOLD', tests: this.tests,
    };
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/rio-device-test-browser-summary.json', JSON.stringify(summary, null, 2) + '\n');
    process.stdout.write('RIO device-test browser verification: ' + result.status + '\n');
  }
}
