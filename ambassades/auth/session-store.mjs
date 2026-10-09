const ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 30 * 1000;
const MAX_PAYLOAD_BYTES = 65536;

function rejectedWrite() {
  return Object.assign(new Error('Session store rejected write.'), {
    status: 503, safeCode: 'SESSION_STORE_UNAVAILABLE',
  });
}

// A bounded, process-local implementation of the SDK's callback session-store contract.
// Expiration and revocation retain tombstones to prevent in-flight requests from restoring old sessions.
export class MemorySessionStore {
  #records = new Map();
  #now;
  #maximum;

  constructor({ maxSessions = 1000, now = Date.now } = {}) {
    if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 10000 || typeof now !== 'function') {
      throw new TypeError('Invalid session store configuration.');
    }
    this.#maximum = maxSessions;
    this.#now = now;
  }

  #purge(time) {
    for (const [id, record] of this.#records) {
      if (record.retireAt <= time) {
        this.#records.delete(id);
      } else if (!record.revoked && record.expiresAt <= time) {
        record.revoked = true;
        record.payload = null;
      }
    }
  }

  get(id, callback) {
    let payload;
    try {
      const time = this.#now();
      if (!Number.isFinite(time)) throw rejectedWrite();
      this.#purge(time);
      const record = this.#records.get(id);
      payload = record && !record.revoked ? structuredClone(record.payload) : null;
    } catch {
      callback(rejectedWrite());
      return;
    }
    callback(null, payload);
  }

  set(id, payload, callback = () => {}) {
    try {
      const time = this.#now();
      if (!Number.isFinite(time)) throw rejectedWrite();
      this.#purge(time);
      const { iat, uat, exp } = payload?.header || {};
      if (typeof id !== 'string' || !id || id.length > 256
          || ![iat, uat, exp].every(Number.isFinite)
          || iat < 0 || uat < iat || exp <= uat
          || iat * 1000 > time + CLOCK_TOLERANCE_MS
          || uat * 1000 > time + CLOCK_TOLERANCE_MS
          || exp * 1000 <= time || exp * 1000 > iat * 1000 + ABSOLUTE_LIFETIME_MS
          || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)
          || !Object.keys(payload.data).length
          || !payload.cookie || payload.cookie.expires !== exp * 1000
          || !Number.isFinite(payload.cookie.maxAge) || payload.cookie.maxAge <= 0
          || new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PAYLOAD_BYTES) {
        throw rejectedWrite();
      }
      const existing = this.#records.get(id);
      if (existing?.revoked || (existing && existing.issuedAt !== iat)) throw rejectedWrite();
      if (!existing && this.#records.size >= this.#maximum) throw rejectedWrite();
      this.#records.set(id, {
        payload: structuredClone(payload),
        issuedAt: iat,
        expiresAt: exp * 1000,
        retireAt: iat * 1000 + ABSOLUTE_LIFETIME_MS + CLOCK_TOLERANCE_MS,
        revoked: false,
      });
    } catch {
      callback(rejectedWrite());
      return;
    }
    callback(null);
  }

  destroy(id, callback = () => {}) {
    try {
      const time = this.#now();
      if (!Number.isFinite(time) || typeof id !== 'string' || !id || id.length > 256) throw rejectedWrite();
      this.#purge(time);
      const existing = this.#records.get(id);
      if (!existing && this.#records.size >= this.#maximum) throw rejectedWrite();
      if (existing?.revoked) {
        callback(null);
        return;
      }
      this.#records.set(id, {
        payload: null,
        expiresAt: time,
        retireAt: time + ABSOLUTE_LIFETIME_MS + CLOCK_TOLERANCE_MS,
        revoked: true,
      });
      callback(null);
    } catch {
      callback(rejectedWrite());
    }
  }
}
