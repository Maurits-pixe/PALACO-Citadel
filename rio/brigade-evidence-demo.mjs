import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { makeBrigadeFixture } from './test-support/brigade-fixtures.mjs';

export function buildBrigadeReferenceReport(sourceCommit = null) {
  const scenarios = [];
  function add(id, expected, configure, options = {}) {
    const fixture = makeBrigadeFixture(options);
    const evaluatorOptions = configure?.(fixture) ?? {};
    const result = fixture.evaluate(evaluatorOptions);
    assert.equal(result.contactEligibility, expected);
    assert.equal(result.canOpenContact, false);
    assert.equal(result.externalSideEffect, false);
    scenarios.push({ id, expected, result });
  }
  add('missing-guard-evidence', 'HOLD', fixture => { fixture.input.evidence = []; });
  add('all-guards-await-human', 'READY_FOR_FINAL_CONFIRMATION');
  add('both-exact-final-receipts', 'REFERENCE_GATE_SATISFIED', undefined, {final:true});
  add('authenticated-guard-failure', 'STOP', fixture => { fixture.replaceEvidence(5, {status:'FAIL'}); });
  add('revoked-before-delivery', 'STOP', fixture => { fixture.snapshot.contactState = 'REVOKED'; },
    {checkpoint:'QUEUED_DELIVERY',final:true});
  add('commit-evidence-replayed-at-delivery', 'HOLD', fixture => {
    fixture.snapshot.checkpoint = 'QUEUED_DELIVERY';
  }, {final:true});
  add('rights-change-during-evaluation', 'HOLD', fixture => {
    let reads = 0;
    return { loadSnapshot: () => ++reads === 1 ? fixture.snapshot
      : {...fixture.snapshot,contactState:'REVOKED'} };
  }, {final:true});
  return {
    schemaVersion:'6ri9ade-scenario-report/0.1', sourceCommit,
    classification:'SYNTHETIC_ONLY', mode:'REFERENCE_ONLY',
    privateKeysIncluded:false, productionConnected:false, scenarios
  };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(JSON.stringify(buildBrigadeReferenceReport(process.env.RIO_SOURCE_COMMIT ?? null), null, 2) + '\n');
}
