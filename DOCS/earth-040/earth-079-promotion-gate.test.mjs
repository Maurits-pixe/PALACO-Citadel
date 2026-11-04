import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGISPromotion} from './earth-079-promotion-gate.mjs';
const valid={cryptographicResult:{status:'CRYPTOGRAPHICALLY_VERIFIED'},sourceReview:{decision:'ACCEPT',independent:true,recordId:'SRC-1',reviewerId:'alice'},releaseReview:{decision:'APPROVE',authorized:true,recordId:'REL-1',reviewerId:'bob'}};
test('no evidence fails closed',()=>assert.equal(evaluateGISPromotion({}).status,'HOLD'));
test('unverified signature blocks promotion',()=>assert.ok(evaluateGISPromotion({...valid,cryptographicResult:{status:'HOLD'}}).reasons.includes('CRYPTOGRAPHIC_VERIFICATION_REQUIRED')));
test('missing source review blocks promotion',()=>assert.ok(evaluateGISPromotion({...valid,sourceReview:null}).reasons.includes('INDEPENDENT_SOURCE_REVIEW_REQUIRED')));
test('same reviewer blocks separation of duties',()=>assert.ok(evaluateGISPromotion({...valid,releaseReview:{...valid.releaseReview,reviewerId:'alice'}}).reasons.includes('SEPARATION_OF_DUTIES_REQUIRED')));
test('complete fixture only becomes eligible for manual promotion',()=>assert.deepEqual(evaluateGISPromotion(valid),{status:'ELIGIBLE_FOR_MANUAL_PROMOTION',reasons:[]}));
