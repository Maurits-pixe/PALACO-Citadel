# Origin-local RIO test key vault v0.1

The optional key vault keeps non-extractable native CryptoKey pairs in IndexedDB. A page reload or browser-process restart can restore the same test endpoint, pinned peer and message history when the same intact browser profile and origin are available. This is local continuity, not a cloud backup, account-recovery service or production enrollment.

## Explicit lifecycle

A trusted local test host calls openRioTestKeyVault from key-vault.mjs with classification='SYNTHETIC_ONLY', role, id, namespace and an explicit mode, then passes the returned handle as keyVault to createEncryptedTestEndpoint.

- ENROLL accepts a previously empty namespace only. It creates one key pair and one epoch.
- RESUME requires the independently retained expectedOwnPin and an existing ACTIVE record. Missing, malformed, mismatched, revoked or unavailable storage rejects; it never silently generates replacement keys.
- endpoint.close() closes the current handle and releases its memory references. Persistent state remains available for explicit RESUME.
- endpoint.revoke() completes a durable REVOKED tombstone, drops stored private-key handles and invalidates every endpoint using that epoch. It does not undo text already accepted.
- REPLACE requires the prior revoked fingerprint, creates a different key pair/epoch and retains old fingerprints, spent message identifiers and the clock high-water mark. The peer is empty and must be explicitly enrolled again. Existing old handles cannot operate on the new epoch.
- Peer identity/fingerprint remains immutable within an epoch. Changing the paired endpoints requires revocation and explicit fresh enrollment; no automatic key update is accepted.

The single-record namespace has at most eight retired fingerprints and 128 sent and 128 consumed message IDs across replacements. There is no erase/reset/export API. A sender reservation stays spent if cryptographic work or final storage fails; this prevents reuse after an interruption.

## Restore and transaction boundaries

Restored keys must be native CryptoKey handles with exact public/private types, permitted usages, non-extractable private material, P-256 or RSA-3072/OAEP-SHA256 algorithms and the expected public SPKI/fingerprint. A sign/verify or encrypt/decrypt challenge proves the public and private handles match before an endpoint is returned.

Web Crypto work runs outside IndexedDB transactions. Short strict-durability readwrite transactions serialize enrollment, sender reservations, current-epoch checks, consumption and revocation across tabs. Sender ID reservation commits before crypto begins; the encrypted result returns only after a current-epoch final transaction. A receiver verifies/decrypts in memory, then commits its consumed ID before returning plaintext. Preview checks current epoch and replay history without consuming.

A persisted clock high-water mark and original message expiry are checked during storage operations. A revoked/replaced epoch or competing consumption prevents final release. Revocation linearizes at its durable transaction; text released by an earlier completed receive cannot be revoked retroactively.

Receiver consumption is at most once: a crash after commit and before display can leave a consumed message without a displayed result. Sender interruption can similarly leave a spent reservation without a returned envelope. The reference does not add an atomic browser-to-service delivery transaction, automatic retries or plaintext restoration.

## Limits of persistence

Persistence requires the same origin and intact browser profile. Deleting, evicting, restoring an older snapshot of, or losing browser storage breaks continuity and is outside the replay guarantee. RESUME fails on missing state; deliberate new ENROLL after deletion creates a new local identity and cannot restore lost history. The private keys are not exportable for an off-device backup, and old private keys are not retained after replacement.

IndexedDB key storage is origin-scoped native structured cloning, not a hardware-keystore or encrypted-disk guarantee. A hostile same-origin script, compromised browser/OS or trusted host can use local handles or change storage. This is not authentication of a real person, multi-device recovery, forward secrecy or absolute safety.

The existing encryption envelope, test bodyguards and local approval route keep their reference status. No live accounts, external relay, production authority or deployment is added.

Primary references: [Web Cryptography Recommendation](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/) for CryptoKey structured cloning and [IndexedDB](https://www.w3.org/TR/IndexedDB/) for transactions. No key material, browser profiles, cookies or database files are uploaded as CI artifacts.
