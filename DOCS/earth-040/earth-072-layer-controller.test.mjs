import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalLayerState,physicalLayerMarkup} from './earth-072-layer-controller.mjs';
const dataset={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]},properties:{}}]};
const evidence={admission:'VERIFIED_SOURCE',render_admission:'APPROVED_FOR_RENDER',renderer_compatible:true};
test('missing evidence yields no physical markup',()=>{const x=physicalLayerMarkup({dataset});assert.equal(x.state.status,'BLOCKED');assert.equal(x.markup,'');});
test('review-only converter evidence yields no physical markup',()=>{const x=physicalLayerMarkup({dataset,evidence:{...evidence,render_admission:'ELIGIBLE_FOR_REVIEW'},sourceApproved:true});assert.equal(x.state.status,'BLOCKED');assert.equal(x.markup,'');});
test('malformed coordinates cannot leak physical markup',()=>{const x=physicalLayerMarkup({dataset:{...dataset,features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[999,0],[1,0],[1,1],[999,0]]]}}]},evidence,sourceApproved:true});assert.equal(x.state.status,'BLOCKED');assert.equal(x.markup,'');});
test('approved fixture produces physical path',()=>{const x=physicalLayerMarkup({dataset,evidence,sourceApproved:true});assert.equal(x.state.status,'READY');assert.match(x.markup,/<path d=/);});
