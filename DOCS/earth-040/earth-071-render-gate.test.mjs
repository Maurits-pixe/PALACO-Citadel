import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedPhysicalPaths} from './earth-071-render-gate.mjs';
const dataset={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]},properties:{}}]};
const evidence={admission:'VERIFIED_SOURCE',render_admission:'APPROVED_FOR_RENDER',renderer_compatible:true};
test('refuses absent independent source approval',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence}),/RENDER_ADMISSION_DENIED/));
test('refuses unreviewed converter output',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:{...evidence,admission:'NOT_ADMITTED'},sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
test('refuses topology warning',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:{...evidence,renderer_compatible:false},sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
test('refuses review-only render status',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:{...evidence,render_admission:'ELIGIBLE_FOR_REVIEW'},sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
test('allows validated fixture with explicit approvals',()=>assert.equal(approvedPhysicalPaths({dataset,evidence,sourceApproved:true}).length,1));

test('rejects missing dataset even when approval flags claim success',()=>assert.throws(()=>approvedPhysicalPaths({dataset:null,evidence,sourceApproved:true}),/./));
test('rejects missing evidence',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:null,sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
test('rejects string approval in place of boolean',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence,sourceApproved:'true'}),/RENDER_ADMISSION_DENIED/));
test('rejects fabricated admission label',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:{...evidence,admission:'APPROVED'},sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
test('rejects string topology flag',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:{...evidence,renderer_compatible:'true'},sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
test('rejects explicit dateline topology block',()=>assert.throws(()=>approvedPhysicalPaths({dataset,evidence:{...evidence,render_admission:'BLOCKED_DATELINE_TOPOLOGY'},sourceApproved:true}),/RENDER_ADMISSION_DENIED/));
