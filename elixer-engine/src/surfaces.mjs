import { packageDigest, deepFreeze } from './integrity.mjs';
import { validateResult, validateSurfaceBinding } from './contracts.mjs';

/** Both surfaces reference exactly the same immutable canonical result. */
export function projectSurfaces(result) {
  if (!validateResult(result).valid) throw new TypeError('INVALID_CANONICAL_RESULT');
  const canonicalDigest = packageDigest(result);
  const binding = surface => {
    const value = { schemaVersion: '0.1', surface, canonicalResultId: result.resultId, canonicalDigest, result };
    if (!validateSurfaceBinding(value).valid) throw new TypeError('INVALID_SURFACE_BINDING');
    return deepFreeze(value);
  };
  return deepFreeze({ full: binding('FULL_ELIXER'), widget: binding('WIDGET') });
}
