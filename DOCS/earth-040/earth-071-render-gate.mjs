// EARTH-071: explicit read-only render gate; source admission and topology are independent.
import { physicalPaths, validatePhysicalGeoJSON } from './physical-geo.mjs';
export function approvedPhysicalPaths({dataset,evidence,sourceApproved},width=900,height=450) {
  if(sourceApproved!==true || evidence?.admission!=='VERIFIED_SOURCE' || evidence?.render_admission!=='APPROVED_FOR_RENDER' || evidence?.renderer_compatible!==true) throw Error('RENDER_ADMISSION_DENIED');
  validatePhysicalGeoJSON(dataset);
  return dataset.features.map(f=>physicalPaths(f,width,height));
}
