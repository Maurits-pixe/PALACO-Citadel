import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const REQUIRED = ['sourceName','sourceURL','publisher','license','licenseEvidenceURL','sourceVersion','retrievedAt','rawSHA256','transformedSHA256','transformationTool','transformationVersion','transformationCommand','coordinateReferenceSystem','geographicAccuracy','provenanceStatus','reviewer','reviewDate','acceptanceDecision'];
const SHA256 = /^[a-f0-9]{64}$/;
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function admitSource(manifest, raw, transformed) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { admitted:false, reason:'INVALID_MANIFEST' };
  for (const key of REQUIRED) if (typeof manifest[key] !== 'string' || !manifest[key].trim()) return { admitted:false, reason:'MISSING_'+key };
  for (const key of ['sourceURL','licenseEvidenceURL']) { try { const u=new URL(manifest[key]); if(u.protocol!=='https:' || !u.hostname || u.username || u.password) return {admitted:false,reason:'UNTRUSTED_'+key}; } catch {return {admitted:false,reason:'INVALID_'+key};} }
  for (const key of ['retrievedAt','reviewDate']) { if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(manifest[key]) || Number.isNaN(Date.parse(manifest[key]+'T00:00:00Z'))) return {admitted:false,reason:'INVALID_'+key}; }
  if (manifest.coordinateReferenceSystem !== 'EPSG:4326') return { admitted:false, reason:'UNSUPPORTED_CRS' };
  if (manifest.provenanceStatus !== 'VERIFIED' || manifest.acceptanceDecision !== 'APPROVED') return { admitted:false, reason:'NOT_APPROVED' };
  if (!SHA256.test(manifest.rawSHA256) || !SHA256.test(manifest.transformedSHA256)) return { admitted:false, reason:'INVALID_CHECKSUM' };
  if (sha256(raw) !== manifest.rawSHA256 || sha256(transformed) !== manifest.transformedSHA256) return { admitted:false, reason:'CHECKSUM_MISMATCH' };
  return { admitted:true, reason:'VERIFIED_SOURCE' };
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [, , manifestPath, rawPath, transformedPath] = process.argv;
  if (!manifestPath || !rawPath || !transformedPath) { console.error('Usage: node gis-admission.mjs manifest.json raw-file transformed-file'); process.exitCode=2; }
  else {
    try {
      const verdict=admitSource(JSON.parse(readFileSync(manifestPath,'utf8')),readFileSync(rawPath),readFileSync(transformedPath));
      console.log(JSON.stringify(verdict)); if(!verdict.admitted) process.exitCode=1;
    } catch(error) { console.error('NOT_ADMITTED',error.message);process.exitCode=1; }
  }
}
