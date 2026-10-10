# RIO encrypted transfer reference v0.1

This package proves a bounded local transfer of artificial text between two browser-owned test endpoints. It adds an opaque transport mode to the existing contact controller and loopback test host. It is not a deployed messaging product, a production cryptographic protocol, a real identity service or a safety certification.

## Built behavior

The sender endpoint generates an ECDSA P-256 private signing key and the receiver generates a 3072-bit RSA-OAEP/SHA-256 private decryption key in their own browser contexts. Private keys are non-extractable Web Crypto keys, retained in endpoint closures and never sent to the service. The trusted test host exchanges public SPKI identities only, supplying the expected peer identifier and SHA-256 key fingerprint independently. Connections are immutable for the endpoint lifetime; replacement requires a new endpoint and new trusted enrollment.

Each message uses a fresh random 256-bit AES key and 96-bit nonce, AES-GCM with a 128-bit tag, RSA-OAEP/SHA-256 wrapping with the authenticated header hash as label, and a sender ECDSA/SHA-256 signature over the canonical complete encrypted envelope. The header binds the fixed suite/version/classification, independently pinned sender/receiver keys, channel/message identifiers, parties and original issuance/expiry. The receiver verifies exact expected context and sender signature before decrypting. Key rotation, wrong parties, altered bytes, invalid encodings and expired contexts reject without releasing text.

These are native primitives defined by the [W3C Web Cryptography specification](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/), with [AES-GCM in NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final). The composition is a new test envelope, not an implementation of JWE, HPKE, Signal or a reviewed production messaging protocol. No third-party cryptographic package or new dependency is added.

## Consent and storage integration

The trusted host selects payloadMode='OPAQUE_TRANSPORT' explicitly. Text-mode INITIATE is rejected there; INITIATE_OPAQUE accepts only bounded canonical base64url bytes. The unchanged default TEXT preview rejects the opaque action. Request state contains text=null and reveals the encrypted payload to the receiver only after NOVA admission at the relevant checkpoint.

The existing eighteen simulated bodyguard checks, exact final choices from both sides, original expiry, durable tombstones and fresh queued-delivery round remain required. The outbox hashes and stores the exact encrypted envelope bytes. When driven by the provided encrypted clients, controller projections and SQLite contain no original text or endpoint private key. Opaque mode bounds and stores transport bytes; it does not certify that an arbitrary client actually encrypted them. Confidentiality assertions apply to the supplied encrypted clients and their verified tests. The local receiver previews decrypted text for its own confirmation; a preview does not consume reception. After host-confirmed DELIVERED, acceptDelivered requires the exact envelope digest and marks its message identifier consumed. Repeated acceptance or preview after consumption rejects.

The digest passed to acceptDelivered is a caller assertion of local delivery, not a cryptographic delivery receipt. The browser harness checks the role-owned HTTP state is DELIVERED before calling it. This reference does not make browser clicks or bodyguard simulations authoritative human/safety evidence.

## Bounds and trust assumptions

- Artificial UTF-8 text only; maximum 512 plaintext bytes and 4096 complete encrypted-envelope bytes.
- Original expiry is at most five minutes; endpoints reject backwards clocks and check expiry again after asynchronous cryptographic work.
- Maximum 128 seals or consumed receptions per endpoint lifetime; a sender cannot seal the same message identifier twice.
- The default endpoint keeps keys/replay in memory. An explicitly enrolled [origin-local key vault](KEY-VAULT.md) can persist native non-extractable keys, pinned peer and replay records across reload/process restart in an intact browser profile. No off-device backup, multi-device synchronization or production enrollment is provided.
- Static recipient RSA keys provide no forward secrecy. The optional test vault supports explicit revocation/replacement; off-device recovery and a reviewed maintained messaging protocol remain future work.
- The test host, browser code, explicit expected context and public-key enrollment are trusted. A compromised page/script/browser/host can observe plaintext or substitute the expected enrollment. Non-extractability does not protect against a hostile same-origin script, and memory zeroization is not guaranteed.
- Metadata and ciphertext lengths remain visible. This does not provide anonymity.
- Cryptography does not establish actual identity, live bodyguard behavior or absolute safety.

The encryption clients are exercised by the automated browser harness; the existing interactive TEXT preview is unchanged. Opaque-mode role pages are harness-only. There is no public key-registration route, external relay, production login or live deployment.

## Validation

Run npm run test:rio:contact for controller, storage and cryptographic rejection tests, and npm run test:rio:encrypted:browser for actual separate Chromium contexts with private keys generated inside each page, vault reload/race/revocation cases and separate persistent browser-process relaunches. The browser tests move encrypted bytes over the existing role-owned loopback HTTP API through both explicit approval rounds, check NOVA isolation, verify receiver decryption, reject modified ciphertext and enforce revocation/replay.

No trace, video, cookies, private keys, original text or database files are uploaded as evidence. Existing desktop/mobile screenshots are from the separate artificial-text contact preview.
