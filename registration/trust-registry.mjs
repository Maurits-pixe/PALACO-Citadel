import { join } from 'node:path';
import { digest } from '../citadel-proof/proof.mjs';
import { ConfinedStore } from './storage.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

/**
 * The digest excludes the digest field itself. A snapshot is accepted only if
 * its epoch and predecessor are consistent with the append-only trust log.
 */
export function trustDigest(snapshot) {
  const { registry_digest: ignored, ...body } = snapshot;
  return digest(body);
}

export function validateTrustSnapshot(snapshot, previous = null) {
  if (!snapshot || !Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1) fail('TRUST_EPOCH_INVALID');
  if (!Array.isArray(snapshot.bindings) || !Array.isArray(snapshot.revoked_keys) || !Array.isArray(snapshot.revoked_grants)) fail('TRUST_SNAPSHOT_INVALID');
  const computed = trustDigest(snapshot);
  if (snapshot.registry_digest !== computed || !hex(snapshot.registry_digest)) fail('TRUST_DIGEST_INVALID');
  if (snapshot.generation === 1) {
    if (snapshot.previous_digest !== null) fail('TRUST_PREDECESSOR_INVALID');
  } else if (!hex(snapshot.previous_digest)) {
    fail('TRUST_PREDECESSOR_INVALID');
  }
  if (previous) {
    if (snapshot.generation < previous.generation) fail('TRUST_ROLLBACK');
    if (snapshot.generation === previous.generation && snapshot.registry_digest !== previous.registry_digest) fail('TRUST_CONFLICT');
    if (snapshot.generation > previous.generation && snapshot.previous_digest !== previous.registry_digest) fail('TRUST_CHAIN_BREAK');
  }
  return computed;
}

export class TrustRegistry {
  constructor(root, allowedRoot) {
    this.store = new ConfinedStore(join(root, 'trust'), allowedRoot);
  }

  async snapshots() {
    const files = (await this.store.list([])).filter(name => /^\d{12}\.json$/.test(name)).sort();
    const result = [];
    for (const file of files) {
      const snapshot = JSON.parse(await this.store.read([], file));
      validateTrustSnapshot(snapshot, result.at(-1) || null);
      result.push(snapshot);
    }
    return result;
  }

  async current() {
    return (await this.snapshots()).at(-1) || null;
  }

  async publish(snapshot) {
    return this.store.locked([], async () => {
      const prior = await this.current();
      validateTrustSnapshot(snapshot, prior);
      const sequence = (await this.snapshots()).length + 1;
      if (snapshot.generation !== sequence) fail('TRUST_EPOCH_SEQUENCE');
      await this.store.atomicCreate([], `${String(sequence).padStart(12, '0')}.json`, `${JSON.stringify(snapshot)}\n`);
      return snapshot;
    });
  }
}
