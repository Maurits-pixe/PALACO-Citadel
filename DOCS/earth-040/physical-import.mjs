// EARTH-060: admission boundary for physical land data. No network or write effects.
import { admitSource } from './gis-admission.mjs';
import { validatePhysicalGeoJSON } from './physical-geo.mjs';
export function preparePhysicalDataset({manifest,rawBytes,transformedBytes}) {
  if(!(rawBytes instanceof Uint8Array) || !(transformedBytes instanceof Uint8Array)) throw Error('MISSING_SOURCE_BYTES');
  const verdict=admitSource(manifest,rawBytes,transformedBytes);
  if(!verdict.admitted) throw Error('SOURCE_NOT_ADMITTED:'+verdict.reason);
  let data;
  try { data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(transformedBytes)); }
  catch { throw Error('INVALID_GEOJSON_ENCODING'); }
  validatePhysicalGeoJSON(data);
  return {data,admission:'VERIFIED_SOURCE',featureCount:data.features.length};
}
