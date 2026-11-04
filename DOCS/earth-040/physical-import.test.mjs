import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from './gis-admission.mjs';
import {preparePhysicalDataset} from './physical-import.mjs';
const raw=new TextEncoder().encode('source fixture');
const data={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}]};
const transformed=new TextEncoder().encode(JSON.stringify(data));
const manifest=()=>({sourceName:'Fixture',sourceURL:'https://example.org/raw',publisher:'Fixture',license:'Test',licenseEvidenceURL:'https://example.org/license',sourceVersion:'1',retrievedAt:'2026-11-01',rawSHA256:sha256(raw),transformedSHA256:sha256(transformed),transformationTool:'fixture',transformationVersion:'1',transformationCommand:'fixture',coordinateReferenceSystem:'EPSG:4326',geographicAccuracy:'TEST',provenanceStatus:'VERIFIED',reviewer:'Fixture',reviewDate:'2026-11-01',acceptanceDecision:'APPROVED'});
test('admitted fixture loads one physical feature',()=>assert.equal(preparePhysicalDataset({manifest:manifest(),rawBytes:raw,transformedBytes:transformed}).featureCount,1));
test('missing manifest is rejected',()=>assert.throws(()=>preparePhysicalDataset({rawBytes:raw,transformedBytes:transformed}),/SOURCE_NOT_ADMITTED/));
test('tampered transformed bytes are rejected',()=>assert.throws(()=>preparePhysicalDataset({manifest:manifest(),rawBytes:raw,transformedBytes:new TextEncoder().encode('{}')}),/SOURCE_NOT_ADMITTED/));
test('unapproved source is rejected',()=>{const m=manifest();m.acceptanceDecision='PENDING';assert.throws(()=>preparePhysicalDataset({manifest:m,rawBytes:raw,transformedBytes:transformed}),/SOURCE_NOT_ADMITTED/)});
test('missing bytes are rejected',()=>assert.throws(()=>preparePhysicalDataset({manifest:manifest(),rawBytes:raw}),/MISSING_SOURCE_BYTES/));

test('rejects oversized raw archive before hashing',()=>{
 const oversized=new Uint8Array(20*1024*1024+1);
 assert.throws(()=>preparePhysicalDataset({manifest:manifest(),rawBytes:oversized,transformedBytes:transformed}),/DATASET_SIZE_LIMIT/);
});
test('rejects oversized GeoJSON before parsing',()=>{
 const oversized=new Uint8Array(20*1024*1024+1);
 assert.throws(()=>preparePhysicalDataset({manifest:manifest(),rawBytes:raw,transformedBytes:oversized}),/DATASET_SIZE_LIMIT/);
});
test('rejects excessive feature count after valid hash',()=>{
 const many={type:'FeatureCollection',features:Array.from({length:20001},()=>data.features[0])};
 const bytes=new TextEncoder().encode(JSON.stringify(many));
 const m=manifest();m.transformedSHA256=sha256(bytes);
 assert.throws(()=>preparePhysicalDataset({manifest:m,rawBytes:raw,transformedBytes:bytes}),/FEATURE_COUNT_LIMIT/);
});

test('rejects excessive coordinate count with matching checksum',()=>{
 const points=Array.from({length:250001},(_,i)=>[i%100,Math.floor(i/100)%80]);
 points.push(points[0]);
 const huge={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[points]}}]};
 const bytes=new TextEncoder().encode(JSON.stringify(huge));
 const m=manifest();m.transformedSHA256=sha256(bytes);
 assert.throws(()=>preparePhysicalDataset({manifest:m,rawBytes:raw,transformedBytes:bytes}),/COORDINATE_LIMIT/);
});
