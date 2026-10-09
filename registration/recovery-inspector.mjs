import { createHash, randomUUID } from 'node:crypto';
import { LocalRegistry } from './registry.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export async function inspectIncidentState(registry, citadelId, { clock = registry?.clock ?? (() => new Date().toISOString()) } = {}) {
  if (!(registry instanceof LocalRegistry)) {
    throw new TypeError('read-only recovery inspection requires LocalRegistry');
  }

  const parts = registry.parts(citadelId);
  const before = (await registry.store.list(parts)).sort();
  const writerLockPresent = before.includes('.writer.lock');
  const pendingNames = before.filter(name => name.startsWith('.pending-')).sort();
  const pendingResidue = [];
  const artifactErrors = [];
  let writerLock = Object.freeze({ present:writerLockPresent, stale_status:'NOT_ESTABLISHED' });

  if (writerLockPresent) {
    try {
      const first = await registry.store.readBytes(parts, '.writer.lock');
      const second = await registry.store.readBytes(parts, '.writer.lock');
      const stableRead = first.equals(second);
      writerLock = Object.freeze({
        present:true,
        stale_status:'NOT_ESTABLISHED',
        size:first.length,
        sha256:sha256(first),
        stable_read:stableRead
      });
      if (!stableRead) artifactErrors.push('.writer.lock: changed during inspection');
    } catch (error) {
      artifactErrors.push(`.writer.lock: ${error.message}`);
    }
  }

  for (const name of pendingNames) {
    try {
      const first = await registry.store.readBytes(parts, name);
      const second = await registry.store.readBytes(parts, name);
      const stableRead = first.equals(second);
      pendingResidue.push(Object.freeze({
        filename: name,
        size: first.length,
        sha256: sha256(first),
        status: 'UNCOMMITTED_RESIDUE',
        stable_read: stableRead
      }));
      if (!stableRead) artifactErrors.push(`${name}: changed during inspection`);
    } catch (error) {
      artifactErrors.push(`${name}: ${error.message}`);
    }
  }

  let ledgerSummary = null;
  let ledgerError = null;
  try {
    ledgerSummary = await registry.inspectCommittedLedger(citadelId);
  } catch (error) {
    ledgerError = error.message;
  }

  const after = (await registry.store.list(parts)).sort();
  const concurrentChangeDetected = !sameList(before, after);
  const durableLedger = ledgerError
    ? Object.freeze({ verified:false, error:ledgerError })
    : Object.freeze({ verified:true, ...ledgerSummary });

  let state = 'CLEAN';
  if (ledgerError || artifactErrors.length) state = 'LEDGER_UNVERIFIED';
  else if (concurrentChangeDetected || (writerLockPresent && pendingNames.length)) state = 'IN_DOUBT';
  else if (writerLockPresent || pendingNames.length) state = 'RECOVERY_REQUIRED';

  const recommendedTransition = state === 'CLEAN'
    ? 'NONE'
    : pendingNames.length
      ? 'EVIDENCE_PRESERVATION_REQUIRED'
      : 'OPERATOR_REVIEW';

  const snapshot = {
    citadel_id:citadelId,
    writer_lock:writerLock,
    pending_residue:Object.freeze(pendingResidue),
    durable_ledger:durableLedger,
    artifact_errors:Object.freeze(artifactErrors),
    concurrent_change_detected:concurrentChangeDetected,
    state,
    recommended_transition:recommendedTransition
  };

  const snapshotSha256 = sha256(JSON.stringify(snapshot));
  return Object.freeze({
    schema:'palaco.registration.recovery-inspection/0.1',
    inspection_id:`RI-${randomUUID()}`,
    snapshot_sha256:snapshotSha256,
    observed_at:Object.freeze({
      value:String(clock()),
      source:'LOCAL_SYSTEM_CLOCK',
      assurance:'UNATTESTED'
    }),
    ...snapshot,
    mutations_performed:Object.freeze([])
  });
}
