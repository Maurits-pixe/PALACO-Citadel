import test from 'node:test';
import assert from 'node:assert/strict';
import {splitAntimeridianLine} from './antimeridian-line.mjs';
test('no crossing retains one line',()=>assert.deepEqual(splitAntimeridianLine([[0,0],[10,5]]),[[[0,0],[10,5]]]));
test('eastbound crossing splits at +180 and -180',()=>assert.deepEqual(splitAntimeridianLine([[179,10],[-179,12]]),[[[179,10],[180,11]],[[-180,11],[-179,12]]]));
test('westbound crossing splits at -180 and +180',()=>assert.deepEqual(splitAntimeridianLine([[-179,10],[179,12]]),[[[-179,10],[-180,11]],[[180,11],[179,12]]]));
test('multiple crossings yield three pieces',()=>assert.equal(splitAntimeridianLine([[179,0],[-179,2],[179,4]]).length,3));
test('invalid coordinate rejected',()=>assert.throws(()=>splitAntimeridianLine([[181,0],[0,0]]),/INVALID_LINE/));
test('no input mutation',()=>{const input=[[179,0],[-179,2]];splitAntimeridianLine(input);assert.deepEqual(input,[[179,0],[-179,2]])});
