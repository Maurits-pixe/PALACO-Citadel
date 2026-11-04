// EARTH-072: fail-closed controller for the optional physical map layer.
// Never substitute unreviewed data or infer approval from a successful conversion.
import {approvedPhysicalPaths} from './earth-071-render-gate.mjs';
export function physicalLayerState(request, width=900, height=450) {
  try {
    const paths=approvedPhysicalPaths(request,width,height);
    return Object.freeze({status:'READY',paths,source:'VERIFIED_PHYSICAL'});
  } catch (_) {
    return Object.freeze({status:'BLOCKED',paths:[],source:'NONE',message:'Fysieke kaartlaag niet toegelaten; demonstratiekaart blijft beschikbaar.'});
  }
}
export function physicalLayerMarkup(request,width=900,height=450) {
  const state=physicalLayerState(request,width,height);
  if(state.status!=='READY') return {state,markup:''};
  // Geometry-to-path serialization is numeric-only after strict validation.
  return {state,markup:state.paths.map(d=>'<path d="'+d+'" fill-rule="evenodd" />').join('')};
}
