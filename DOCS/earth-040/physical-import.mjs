// EARTH-060: admission boundary for physical land data. No network or write effects.
import { admitSource } from './gis-admission.mjs';
import { validatePhysicalGeoJSON } from './physical-geo.mjs';
const MAX_RAW_BYTES=20*1024*1024;
const MAX_GEOJSON_BYTES=20*1024*1024;
const MAX_FEATURES=20000;
const MAX_COORDINATE_PAIRS=250000;
export function preparePhysicalDataset({manifest,rawBytes,transformedBytes}) {
  if(!(rawBytes instanceof Uint8Array) || !(transformedBytes instanceof Uint8Array)) throw Error('MISSING_SOURCE_BYTES');
  if(rawBytes.byteLength>MAX_RAW_BYTES || transformedBytes.byteLength>MAX_GEOJSON_BYTES) throw Error('DATASET_SIZE_LIMIT');
  const verdict=admitSource(manifest,rawBytes,transformedBytes);
  if(!verdict.admitted) throw Error('SOURCE_NOT_ADMITTED:'+verdict.reason);
  let data;
  try { data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(transformedBytes)); }
  catch { throw Error('INVALID_GEOJSON_ENCODING'); }
  if(data?.type==='FeatureCollection' && Array.isArray(data.features) && data.features.length>MAX_FEATURES) throw Error('FEATURE_COUNT_LIMIT');
  // Count nested coordinate arrays before invoking the geometry renderer.
  let coordinatePairs=0;
  const stack=(data?.features||[]).map(f=>f?.geometry?.coordinates);
  while(stack.length){
    const node=stack.pop();
    if(!Array.isArray(node)) throw Error('INVALID_COORDINATES');
    if(node.length>=2 && typeof node[0]==='number' && typeof node[1]==='number') {
      if(++coordinatePairs>MAX_COORDINATE_PAIRS) throw Error('COORDINATE_LIMIT');
    } else for(const child of node) stack.push(child);
  }
  validatePhysicalGeoJSON(data);
  return {data,admission:'VERIFIED_SOURCE',featureCount:data.features.length};
}
