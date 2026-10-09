import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createLab, SCENARIOS, FIXED_NOW } from './src/fixtures.mjs';
import { validateResult, validateTraceReceipt } from './src/contracts.mjs';
import { projectSurfaces } from './src/surfaces.mjs';

const expected = { ready: 'READ_RESULT', 'no-consent': 'READ_RESULT', revoked: 'REVOKED', expired: 'EXPIRED', offline: 'OFFLINE_READ_ONLY', conflict: 'REVIEW_REQUIRED', unauthorized: 'BLOCKED', tampered: 'BLOCKED', execution: 'EXECUTION_PENDING_AUTHORIZATION' };
const runs = [];
for (const scenario of SCENARIOS) {
  const lab = createLab({ scenario });
  const canonical = await lab.engine.run({ manifest: lab.manifest, package: lab.package, request: lab.request });
  const surfaces = projectSurfaces(canonical);
  const receipts = lab.engine.journal.entries();
  if (canonical.resultType !== expected[scenario] || !validateResult(canonical).valid || !lab.engine.journal.verify() || !receipts.every(receipt => validateTraceReceipt(receipt).valid)) throw new Error('CONFORMANCE_SCENARIO_FAILED:' + scenario);
  runs.push({ scenario, packageDigest: lab.manifest.packageDigest, canonical, surfaces, receipts });
}
const sourceSnapshots = ['kernel-contract.txt', 'laboratory-contract.txt'].map(name => ({
  name, sha256: createHash('sha256').update(readFileSync(new URL('./sources/' + name, import.meta.url))).digest('hex'),
}));
process.stdout.write(JSON.stringify({
  kind: 'ELIXER_LAB_EVIDENCE', schemaVersion: '0.1', syntheticOnly: true, labClock: FIXED_NOW,
  sourceCommit: /^[a-f0-9]{40}$/.test(process.env.ELIXER_SOURCE_COMMIT ?? '') ? process.env.ELIXER_SOURCE_COMMIT : null,
  institutionalAcceptance: 'PENDING_INDEPENDENT_REVIEW', operativeAuthority: 'NONE',
  signatureVerification: 'NOT_IMPLEMENTED', productionActivation: 'INACTIVE',
  sourceSnapshots, runs,
}, null, 2) + '\n');
