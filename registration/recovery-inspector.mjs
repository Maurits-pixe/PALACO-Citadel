import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export async function inspectIncidentState(registry, citadelId, { clock = registry?.clock ?? (() => new Date().toISOString()) } = {}) {
  if (!registry?.store || typeof registry.parts !== 'function' || typeof registry.inspectCommittedEvents !== 'function') {
    throw new TypeError('read-only recovery inspection requires a LocalRegistry-compatible registry');
  }

  const parts = registry.parts(citadelId);
  const before = (await registry.store.list(parts)).sort();
  const writerLockPresent = before.includes('.writer.lock');
  const pendingNames = before.filter(name => name.startsWith('.pending-')).sort();
  const pendingResidue = [];
  const artifactErrors = [];

  for (const name of pendingNames) {
    try {
      const first = await registry.store.read(parts, name);
      const second = await registry.store.read(parts, name);
      const stableRead = first === second;
      pendingResidue.push(Object.freeze({
        filename: name,
        size: Buffer.byteLength(first, 'utf8'),
        sha256: sha256(first),
        status: 'UNCOMMITTED_RESIDUE',
        stable_read: stableRead
      }));
      if (!stableRead) artifactErrors.push(`${name}: changed during inspection`);
    } catch (error) {
      artifactErrors.push(`${name}: ${error.message}`);
    }
  }

  let records = [];
  let ledgerError = null;
  try {
    records = await registry.inspectCommittedEvents(citadelId);
  } catch (error) {
    ledgerError = error.message;
  }

  const after = (await registry.store.list(parts)).sort();
  const concurrentChangeDetected = !sameList(before, after);
  const durableLedger = ledgerError
    ? Object.freeze({ verified:false, error:ledgerError })
    : Object.freeze({
        verified:true,
        event_count:records.length,
        head_sequence:records.at(-1)?.sequence ?? 0,
        head_hash:records.at(-1)?.recordHash ?? null,
        last_event_type:records.at(-1)?.event?.type ?? null
      });

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
    writer_lock:Object.freeze({
      present:writerLockPresent,
      stale_status:'NOT_ESTABLISHED'
    }),
    pending_residue:Object.freeze(pendingResidue),
    durable_ledger:durableLedger,
    artifact_errors:Object.freeze(artifactErrors),
    concurrent_change_detected:concurrentChangeDetected,
    state,
    recommended_transition:recommendedTransition
  };

  return Object.freeze({
    schema:'palaco.registration.recovery-inspection/0.1',
    inspection_id:`RI-${sha256(JSON.stringify(snapshot)).slice(0,24)}`,
    observed_at:Object.freeze({
      value:String(clock()),
      source:'LOCAL_SYSTEM_CLOCK',
      assurance:'UNATTESTED'
    }),
    ...snapshot,
    mutations_performed:Object.freeze([])
  });
}
