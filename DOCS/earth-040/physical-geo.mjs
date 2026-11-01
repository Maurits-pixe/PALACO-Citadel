// EARTH-053: physical geometry adapter; does not confer geographic provenance.
const point = p => Array.isArray(p) && p.length >= 2 && p.slice(0,2).every(Number.isFinite) && p[0]>=-180 && p[0]<=180 && p[1]>=-90 && p[1]<=90;
const ring = r => Array.isArray(r) && r.length>=4 && r.every(point) && r[0][0]===r.at(-1)[0] && r[0][1]===r.at(-1)[1];
const polygon = p => Array.isArray(p) && p.length>0 && p.every(ring);
export function validatePhysicalGeoJSON(data) {
  if(!data || data.type!=='FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw Error('INVALID_COLLECTION');
  for(const f of data.features) {
    if(!f || f.type!=='Feature' || !f.geometry) throw Error('INVALID_FEATURE');
    const {type,coordinates}=f.geometry;
    if(type==='Polygon' ? !polygon(coordinates) : type==='MultiPolygon' ? !(Array.isArray(coordinates)&&coordinates.length>0&&coordinates.every(polygon)) : true) throw Error('INVALID_GEOMETRY');
  }
  return data;
}
const project=([lon,lat],w,h)=>[(lon+180)/360*w,(90-lat)/180*h];
export function physicalPaths(feature,width=900,height=450) {
  if(!feature?.geometry) throw Error('INVALID_FEATURE');
  const {type,coordinates}=feature.geometry;
  const polygons=type==='Polygon'?[coordinates]:type==='MultiPolygon'?coordinates:null;
  if(!polygons || !polygons.every(polygon)) throw Error('INVALID_GEOMETRY');
  return polygons.map(p=>p.map(r=>r.map((pt,i)=>{const [x,y]=project(pt,width,height);return (i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)}).join(' ')+' Z').join(' ')).join(' ');
}

// Explicit SVG evenodd fill rule is required to display interior rings as holes.
// This helper returns markup for already validated geometry only; never inject untrusted attributes.
export function physicalSvgPath(feature,width=900,height=450) {
  const d=physicalPaths(feature,width,height);
  return '<path d="'+d+'" fill-rule="evenodd" />';
}
