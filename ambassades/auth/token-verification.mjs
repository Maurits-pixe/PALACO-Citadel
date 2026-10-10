import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';

const MAX_JSON_BYTES = 65536;
const METADATA_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function httpsURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new TypeError('Invalid identity endpoint.');
  }
  return url;
}

async function boundedJSONResponse(url, options = {}) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(url, { ...options, signal, redirect: 'error' });
  if (response.status !== 200
      || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    throw new TypeError('Invalid identity response.');
  }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    await response.body?.cancel();
    throw new TypeError('Identity response exceeds limit.');
  }
  const chunks = [];
  let bytes = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new TypeError('Empty identity response.');
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) throw new TypeError('Identity response exceeds limit.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(body, { status: response.status, headers: response.headers });
}

// Adds explicit RS256/JWKS signature verification to the SDK's TLS-secured code flow.
// All network trust comes from the configured HTTPS issuer; token-controlled URLs are unused.
export function createIdTokenVerifier({ issuerBaseURL, clientID }) {
  const configuredIssuer = httpsURL(issuerBaseURL);
  if (!clientID || typeof clientID !== 'string') throw new TypeError('Invalid identity client.');
  const discoveryURL = httpsURL(configuredIssuer.href.replace(/\/$/, '') + '/.well-known/openid-configuration');
  let cached, cacheUntil = 0;

  async function metadata() {
    if (cached && Date.now() < cacheUntil) return cached;
    cacheUntil = Date.now() + METADATA_TTL_MS;
    cached = (async () => {
      const document = await (await boundedJSONResponse(discoveryURL)).json();
      if (!document || typeof document !== 'object' || document.issuer !== issuerBaseURL) {
        throw new TypeError('Identity issuer mismatch.');
      }
      const jwksURL = httpsURL(document.jwks_uri);
      return createRemoteJWKSet(jwksURL, {
        timeoutDuration: FETCH_TIMEOUT_MS,
        cacheMaxAge: METADATA_TTL_MS,
        cooldownDuration: 30000,
        [customFetch]: boundedJSONResponse,
      });
    })();
    try { return await cached; } catch (error) {
      cached = undefined;
      cacheUntil = 0;
      throw error;
    }
  }

  return async idToken => {
    if (typeof idToken !== 'string' || !idToken || Buffer.byteLength(idToken) > MAX_JSON_BYTES) {
      throw new TypeError('Invalid identity token.');
    }
    const keySet = await metadata();
    const { payload } = await jwtVerify(idToken, keySet, {
      algorithms: ['RS256'],
      issuer: issuerBaseURL,
      audience: clientID,
      requiredClaims: ['iss', 'sub', 'aud', 'iat', 'exp'],
      clockTolerance: 30,
    });
    return payload;
  };
}
