import { canonicalJSON, deepFreeze, packageDigest } from './integrity.mjs';
import { validateTraceReceipt } from './contracts.mjs';

const copy = (value) => JSON.parse(canonicalJSON(value));
const receiptIdFor = (sequence) => 'elixer-receipt-' + String(sequence).padStart(8, '0');
const hashPayload = ({ schemaVersion, type, sequence, previousHash, event }) => ({ schemaVersion, type, sequence, previousHash, event });

/** Process-local, append-only evidence chain. It is not a durable or externally anchored audit log. */
export function createJournal() {
  const records = [];
  return Object.freeze({
    append(event) {
      const eventCopy = copy(event);
      const sequence = records.length + 1;
      const previousHash = records.length ? records[records.length - 1].hash : null;
      const envelope = { schemaVersion: '0.1', type: 'LAB_RUN_RECEIPT', sequence, previousHash, event: eventCopy };
      const hash = packageDigest(envelope);
      const receiptId = receiptIdFor(sequence);
      const record = { ...envelope, hash, receiptId };
      if (!validateTraceReceipt(record).valid) throw new TypeError('Invalid trace receipt event');
      records.push(deepFreeze(record));
      return deepFreeze({ sequence, hash, receiptId });
    },
    entries() {
      return deepFreeze(copy(records));
    },
    verify() {
      let previousHash = null;
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!validateTraceReceipt(record).valid || record.sequence !== index + 1 || record.previousHash !== previousHash) return false;
        if (record.receiptId !== receiptIdFor(record.sequence)) return false;
        if (record.hash !== packageDigest(hashPayload(record))) return false;
        previousHash = record.hash;
      }
      return true;
    },
  });
}
