// EARTH-057: split open polylines at the antimeridian. Not a polygon topology algorithm.
const valid = p => Array.isArray(p) && p.length===2 && p.every(Number.isFinite) && p[0]>=-180 && p[0]<=180 && p[1]>=-90 && p[1]<=90;
export function splitAntimeridianLine(points) {
  if(!Array.isArray(points) || points.length<2 || !points.every(valid)) throw Error('INVALID_LINE');
  const pieces=[[points[0].slice()]];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], delta=b[0]-a[0];
    if(Math.abs(delta)<=180) { pieces.at(-1).push(b.slice()); continue; }
    // Unwrap the shortest longitudinal arc and interpolate the boundary latitude.
    const unwrapped=delta>180 ? b[0]-360 : b[0]+360;
    const edge=delta>180 ? -180 : 180;
    const fraction=(edge-a[0])/(unwrapped-a[0]);
    const latitude=a[1]+fraction*(b[1]-a[1]);
    if(!Number.isFinite(latitude) || fraction<0 || fraction>1) throw Error('INVALID_CROSSING');
    pieces.at(-1).push([edge,latitude]);
    pieces.push([[-edge,latitude],b.slice()]);
  }
  return pieces;
}
