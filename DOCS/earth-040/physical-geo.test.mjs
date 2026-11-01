import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhysicalGeoJSON,physicalPaths,physicalSvgPath} from './physical-geo.mjs';
const ring=[[0,0],[10,0],[10,10],[0,0]];
const hole=[[1,1],[2,1],[2,2],[1,1]];
const polygon={type:'Feature',geometry:{type:'Polygon',coordinates:[ring,hole]},properties:{}};
const multi={type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[ring],[ring]]},properties:{}};
test('validates Polygon with interior ring',()=>assert.equal(validatePhysicalGeoJSON({type:'FeatureCollection',features:[polygon]}).features.length,1));
test('supports MultiPolygon',()=>assert.match(physicalPaths(multi),/Z.*M.*Z/));
test('renders interior ring',()=>assert.equal((physicalPaths(polygon).match(/Z/g)||[]).length,2));
test('rejects invalid longitude',()=>assert.throws(()=>validatePhysicalGeoJSON({type:'FeatureCollection',features:[{...polygon,geometry:{type:'Polygon',coordinates:[[[181,0],[0,0],[1,1],[181,0]]]}}]})));
test('rejects unclosed ring',()=>assert.throws(()=>physicalPaths({...polygon,geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[2,2]]]}})));
test('rejects empty collection',()=>assert.throws(()=>validatePhysicalGeoJSON({type:'FeatureCollection',features:[]})));

test('SVG uses evenodd for interior rings',()=>assert.match(physicalSvgPath(polygon),/fill-rule="evenodd"/));

test('rejects antimeridian crossings rather than drawing a world-spanning edge',()=>{
 const feature={type:'Feature',geometry:{type:'Polygon',coordinates:[[[179,10],[-179,10],[-179,11],[179,10]]]},properties:{}};
 assert.throws(()=>physicalPaths(feature),/INVALID_GEOMETRY/);
 assert.throws(()=>validatePhysicalGeoJSON({type:'FeatureCollection',features:[feature]}),/INVALID_OR_DATELINE_GEOMETRY/);
});
