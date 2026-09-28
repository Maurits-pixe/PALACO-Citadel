# PALACO Registration Layer v0.1 — local reference

This directory maps identity, ERA, WATERMERK, HOLOGRAM, proof and authority to a local event register. Read [the gap and rollout map](docs/AUTHORIZATION-MAP.md) and [verification documents](docs/VERIFICATION-RECORDS.md). Run `node --test registration/registry.test.mjs`.

Use an absolute path outside the repository as the data root on the operator's computer. The `LocalRegistry` constructor accepts that path and a trusted issuer-key map. The sample code does not install a service, read the maker's laptop, sync browser data, or grant production authority. No personal records or signing keys belong in GitHub. All timestamps from this adapter are `LOCAL_SYSTEM_CLOCK / UNATTESTED`. `authorize` returns only `ALLOW_FOR_PREVIEW_ONLY`; an independent commit gate is mandatory. A WATERMERK or HOLOGRAM event is a registered marker, never a credential.

The current reference uses JSON property insertion order and hash chaining inside a local filesystem; it has no signed external checkpoint. Do not claim RFC 8785 canonicalization, RFC 3161 timestamping, append-only storage against a malicious local administrator, or legal compliance from this module.
