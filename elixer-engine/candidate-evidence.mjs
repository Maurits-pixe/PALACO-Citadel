import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildLabCandidatePackage, loadLabCandidate, verifyLabCandidatePackage } from './src/lab-candidate.mjs';
import { canonicalJSON } from './src/integrity.mjs';

const sourceCommit = process.env.ELIXER_SOURCE_COMMIT ?? null;
if (sourceCommit !== null && !/^[a-f0-9]{40}$/.test(sourceCommit)) throw new TypeError('INVALID_SOURCE_COMMIT');
const bundle = buildLabCandidatePackage(loadLabCandidate());
const binding = { candidateId: bundle.manifest.candidateId, version: bundle.manifest.version, packageDigest: bundle.packageDigest };
const verification = verifyLabCandidatePackage(bundle, binding);
if (!verification.valid) throw new Error('CANDIDATE_INTEGRITY_FAILED');
const sourceFiles = ['lab/haram-candidate.json', 'schemas/elixer-lab-candidate-v0.1.json', 'src/lab-candidate.mjs', 'src/contracts.mjs', 'src/integrity.mjs', 'candidate-evidence.mjs'].map(path => ({ path, sha256: createHash('sha256').update(readFileSync(new URL('./' + path, import.meta.url))).digest('hex') }));
process.stdout.write(JSON.stringify({
  kind: 'ELIXER_LAB_CANDIDATE_EVIDENCE', sourceCommit, syntheticOnly: true,
  bundle, payloadBytes: Buffer.byteLength(canonicalJSON({ format: bundle.format, manifest: bundle.manifest }), 'utf8'),
  verification, verificationScope: 'Local reproducibility self-check; expected digest is derived here, not externally attested.',
  sourceFiles, conformance: 'NOT_ATTESTED_BY_THIS_REPORT', independentReview: 'REQUIRED',
  signatureVerification: 'NOT_IMPLEMENTED', officialIssuance: 'NOT_REQUESTED', runtimeActivation: 'INACTIVE',
}, null, 2) + '\n');
