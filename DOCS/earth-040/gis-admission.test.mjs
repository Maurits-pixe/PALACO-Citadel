import test from 'node:test';
import assert from 'node:assert/strict';
import { admitSource, sha256 } from './gis-admission.mjs';
const raw=Buffer.from('raw-source');
const converted=Buffer.from('transformed-source');
const manifest=()=>({
 sourceName:'Sample',sourceURL:'https://example.org/data',publisher:'Example',license:'Public Domain',licenseEvidenceURL:'https://example.org/license',sourceVersion:'v1',retrievedAt:'2026-11-01',rawSHA256:sha256(raw),transformedSHA256:sha256(converted),transformationTool:'fixture',transformationVersion:'1',transformationCommand:'fixture',coordinateReferenceSystem:'EPSG:4326',geographicAccuracy:'TEST_ONLY',provenanceStatus:'VERIFIED',reviewer:'Test reviewer',reviewDate:'2026-11-01',acceptanceDecision:'APPROVED'});
test('complete checksum-matched fixture is admissible',()=>assert.equal(admitSource(manifest(),raw,converted).admitted,true));
test('missing provenance fails closed',()=>{const m=manifest();delete m.licenseEvidenceURL;assert.equal(admitSource(m,raw,converted).admitted,false)});
test('unapproved source fails closed',()=>{const m=manifest();m.acceptanceDecision='PENDING';assert.equal(admitSource(m,raw,converted).admitted,false)});
test('modified raw data fails closed',()=>assert.equal(admitSource(manifest(),Buffer.from('tampered'),converted).admitted,false));
test('modified transformed data fails closed',()=>assert.equal(admitSource(manifest(),raw,Buffer.from('tampered')).admitted,false));
test('unsupported CRS fails closed',()=>{const m=manifest();m.coordinateReferenceSystem='EPSG:3857';assert.equal(admitSource(m,raw,converted).admitted,false)});
