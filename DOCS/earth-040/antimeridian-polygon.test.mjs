import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSimpleDateLinePolygon} from './antimeridian-polygon.mjs';
const box=[[[179,10],[-179,10],[-179,12],[179,12],[179,10]]];
test('splits simple dateline rectangle into two closed rings',()=>{
 const out=splitSimpleDateLinePolygon(box);assert.equal(out.length,2);
 for(const polygon of out){const ring=polygon[0];assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.every(p=>Math.abs(p[0])>=179));}
});
test('ordinary ring remains unchanged',()=>assert.deepEqual(splitSimpleDateLinePolygon([[[0,0],[1,0],[1,1],[0,0]]]),[[[[0,0],[1,0],[1,1],[0,0]]] ]));
test('rejects holes pending topology-aware handling',()=>assert.throws(()=>splitSimpleDateLinePolygon([box[0],box[0]]),/UNSUPPORTED_HOLES/));
test('rejects invalid ring',()=>assert.throws(()=>splitSimpleDateLinePolygon([[[0,0],[1,0],[1,1],[2,2]]]),/INVALID_RING/));

test('rejects nonrectangular crossing topology',()=>assert.throws(()=>splitSimpleDateLinePolygon([[[179,0],[-179,0],[-178,2],[179,2],[179,0]]]),/UNSUPPORTED_TOPOLOGY/));
test('rejects rings with Greenwich-side vertices and dateline crossings',()=>assert.throws(()=>splitSimpleDateLinePolygon([[[179,0],[-179,0],[0,2],[179,2],[179,0]]]),/UNSUPPORTED_TOPOLOGY/));
test('split rectangle preserves planar total area in lon-lat coordinates',()=>{
 const output=splitSimpleDateLinePolygon(box);
 const area=r=>Math.abs(r.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*r[i+1][1]-r[i+1][0]*p[1],0))/2;
 assert.equal(output.reduce((sum,p)=>sum+area(p[0]),0),4);
});
