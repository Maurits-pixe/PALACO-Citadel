export const METADATA_PATH = '/.well-known/palaco-app.json';
export const VERIFICATION_TIMEOUT_MS = 5000;
export const VERIFICATION_TTL_MS = 60 * 1000;
const MAX_METADATA_BYTES = 16 * 1024;

export function parseHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!/^https:\/\//i.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:'
      && url.hostname
      && !url.username
      && !url.password
      && url.pathname === '/'
      && !url.search
      && !url.hash
      ? url
      : null;
  } catch {
    return null;
  }
}

export function normalizeApprovedOrigin(value) {
  const url = parseHttpsUrl(value);
  if (!url || url.pathname !== '/' || url.search || url.hash) return null;
  return url.origin;
}

export function isOriginApproved(value, approvedOrigin) {
  const url = parseHttpsUrl(value);
  const approved = normalizeApprovedOrigin(approvedOrigin);
  return Boolean(url && approved && url.origin === approved);
}

function result(status, reason, origin, expectedAppId, checkedAt, extra = {}) {
  return {
    status,
    reason,
    origin,
    endpoint: origin ? new URL(METADATA_PATH, origin).href : null,
    method: 'GET',
    expectedAppId,
    receivedAppId: null,
    checkedAt,
    expiresAt: checkedAt + VERIFICATION_TTL_MS,
    ...extra
  };
}

function isValidMetadata(metadata, expectedAppId) {
  return Boolean(
    metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    && metadata.appId === expectedAppId
    && typeof metadata.version === 'string'
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(metadata.version)
    && ['operational', 'degraded', 'maintenance', 'unavailable'].includes(metadata.status)
    && Object.keys(metadata).every(key => ['appId', 'version', 'status'].includes(key))
  );
}

async function readMetadata(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    return { error: 'invalid_response' };
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_METADATA_BYTES) {
    return { error: 'invalid_response' };
  }

  const reader = response.body?.getReader();
  if (!reader) return { error: 'invalid_response' };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_METADATA_BYTES) {
        await reader.cancel();
        return { error: 'invalid_response' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { metadata: JSON.parse(text) };
  } catch {
    return { error: 'invalid_response' };
  } finally {
    reader.releaseLock();
  }
}

export async function verifyModuleMetadata(value, expectedAppId, approvedOrigin, {
  fetchImpl = globalThis.fetch,
  timeoutMs = VERIFICATION_TIMEOUT_MS,
  now = Date.now,
  monotonicNow = () => performance.now()
} = {}) {
  const checkedAt = now();
  const startedAt = monotonicNow();
  const complete = outcome => ({
    ...outcome,
    durationMs: Math.max(0, Math.round(monotonicNow() - startedAt))
  });
  const url = parseHttpsUrl(value);
  const origin = url?.origin || null;

  if (!url) return complete(result('verification-failed', 'invalid_url', origin, expectedAppId, checkedAt));
  if (!isOriginApproved(url.href, approvedOrigin)) {
    return complete(result('destination-unapproved', 'destination_unapproved', origin, expectedAppId, checkedAt));
  }

  const controller = new AbortController();
  let timeoutId;
  let timedOut = false;
  const request = (async () => {
    let response;
    try {
      response = await fetchImpl(new URL(METADATA_PATH, origin), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
    } catch {
      return result('check-unavailable', 'request_unavailable', origin, expectedAppId, checkedAt);
    }

    if (response.status !== 200) {
      return result('verification-failed', 'http_error', origin, expectedAppId, checkedAt, {
        httpStatus: response.status
      });
    }

    const parsed = await readMetadata(response);
    if (parsed.error) return result('verification-failed', parsed.error, origin, expectedAppId, checkedAt);

    const metadata = parsed.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || typeof metadata.appId !== 'string' || metadata.appId !== expectedAppId) {
      return result('verification-failed', 'wrong_identity', origin, expectedAppId, checkedAt, {
        receivedAppId: typeof metadata?.appId === 'string' ? metadata.appId : null
      });
    }
    if (!isValidMetadata(metadata, expectedAppId)) {
      return result('verification-failed', 'invalid_response', origin, expectedAppId, checkedAt, {
        receivedAppId: metadata.appId
      });
    }

    return result('metadata-confirmed', null, origin, expectedAppId, checkedAt, {
      receivedAppId: metadata.appId,
      version: metadata.version,
      reportedStatus: metadata.status
    });
  })();

  const timeout = new Promise(resolve => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve(result('check-unavailable', 'timeout', origin, expectedAppId, checkedAt));
    }, timeoutMs);
  });

  try {
    const outcome = await Promise.race([request, timeout]);
    if (timedOut) return complete(result('check-unavailable', 'timeout', origin, expectedAppId, checkedAt));
    return complete(outcome);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getEvidenceStatus(evidence, now = Date.now()) {
  if (!evidence) return 'configured';
  if (evidence.status === 'metadata-confirmed' && evidence.expiresAt <= now) return 'verification-expired';
  return evidence.status;
}

export function createRequestGuard() {
  const generations = new Map();
  return {
    begin(id) {
      const generation = (generations.get(id) || 0) + 1;
      generations.set(id, generation);
      return generation;
    },
    isCurrent(id, generation) {
      return generations.get(id) === generation;
    }
  };
}

export function commitIfCurrent({ guard, id, generation, currentUrl, expectedUrl, commit, value }) {
  if (!guard.isCurrent(id, generation) || currentUrl !== expectedUrl) return false;
  commit(value);
  return true;
}
