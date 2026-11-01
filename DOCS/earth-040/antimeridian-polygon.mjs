// EARTH-058: conservative antimeridian polygon splitter.
// Handles simple exterior rings crossing the dateline exactly twice.
// Interior rings and complex multiple crossings are explicitly rejected.
const valid = p => Array.isArray(p) && p.length===2 && p.every(Number.isFinite) && p[0]>=-180 && p[0]<=180 && p[1]>=-90 && p[1]<=90;
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
export function splitSimpleDateLinePolygon(rings) {
 if(!Array.isArray(rings)||rings.length!==1) throw Error('UNSUPPORTED_HOLES');
 const ring=rings[0];
 if(!Array.isArray(ring)||ring.length<4||!ring.every(valid)||!same(ring[0],ring.at(-1))) throw Error('INVALID_RING');
 // Limit this prototype to axis-aligned four-corner rectangles adjacent to the dateline.
 // More complex rings require a topology-preserving polygon clipping library.
 if(ring.length!==5 || ring.some(p=>Math.abs(p[0])<170)) throw Error('UNSUPPORTED_TOPOLOGY');
 const lons=[...new Set(ring.slice(0,-1).map(p=>p[0]))];
 const lats=[...new Set(ring.slice(0,-1).map(p=>p[1]))];
 if(lons.length!==2 || lats.length!==2 || !ring.slice(0,-1).every(p=>lons.includes(p[0])&&lats.includes(p[1])) ||
    new Set(ring.slice(0,-1).map(p=>p.join(','))).size!==4) throw Error('UNSUPPORTED_TOPOLOGY');
 const crossings=[];
 for(let i=1;i<ring.length;i++) {
  const a=ring[i-1],b=ring[i],d=b[0]-a[0];
  if(Math.abs(d)>180) {
   const edge=d>180?-180:180,unwrapped=d>180?b[0]-360:b[0]+360;
   const t=(edge-a[0])/(unwrapped-a[0]);
   crossings.push({i,edge,lat:a[1]+t*(b[1]-a[1])});
  }
 }
 if(crossings.length===0) return [rings];
 if(crossings.length!==2 || crossings[0].edge===crossings[1].edge) throw Error('UNSUPPORTED_TOPOLOGY');
 const east=[],west=[];
 for(let i=0;i<ring.length-1;i++) {
  const p=ring[i], side=p[0]>=0?east:west;
  side.push(p.slice());
  const cross=crossings.find(c=>c.i===i+1);
  if(cross) {east.push([180,cross.lat]);west.push([-180,cross.lat]);}
 }
 const close=arr=>{if(arr.length>=3&&!same(arr[0],arr.at(-1))) arr.push(arr[0].slice());return arr};
 // This partition is only valid for convex, monotone simple shapes; reject ambiguous cases.
 if(east.length<3||west.length<3) throw Error('UNSUPPORTED_TOPOLOGY');
 return [[close(east)],[close(west)]];
}
