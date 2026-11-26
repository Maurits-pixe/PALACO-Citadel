# PALACO Citadel — cryptographic receipt verifier (DRAFT / HOLD)

This isolated Node.js module validates exact receipt bytes using SHA-256 and a
detached ECDSA P-256/SHA-256 signature. It does not modify or connect to the
browser preview, identity service, reviewer registry, or production authorization.

`verifyReceiptSignature(payloadBytes, envelope, publicJwk)` accepts:
- Exact UTF-8 bytes (nonempty Uint8Array, maximum 2 MiB)
- A strict envelope with `schema: palaco-citadel-receipt-crypto-v1`,
  lowercase `payloadSha256`, and base64url DER `signatureBase64Url`
- An exact public EC P-256 JWK with `kty`, `crv`, `x`, and `y`; no private key

The signature covers the UTF-8 bytes of `PALACO-CITADEL-RECEIPT-V1\\n`
followed by the exact payload bytes. The verifier hashes the payload itself
rather than trusting an asserted digest. It checks the DER signature using
Node.js crypto and returns the public key's SPKI SHA-256 fingerprint.

**Security boundary:** mathematical signature validity only confirms that the
corresponding private key signed those bytes. The supplied public key is not
independently trusted or connected to a verified PALACO identity. Even for a
valid signature: `trust: NOT_ESTABLISHED`, `authorization: DENY`,
`executionAllowed: false`, `releaseAllowed: false`.

Run: `node --test modules/samenleving-natuur/receipt-crypto-verifier.test.mjs`.

The implementation is a Node.js-only reference, with synthetic keys generated
in tests. Before integrating with applications, separately specify identity/key
enrollment, revocation, policy versioning, signature format, signed payload
serialization and authorized execution. **PR #63 remains DRAFT/HOLD.**
