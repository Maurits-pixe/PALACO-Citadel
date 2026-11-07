import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessChannel, canReadTask, canUpdateTask } from './policy.js';

const operative = { team_id: '7', user_id: '11', role: 'operative', clearance_level: 2 };
const task = {
  team_id: '7',
  clearance_level: 2,
  assigned_to: '11',
  created_by: '19'
};

test('task access fails closed for another team, excessive clearance, and unrelated users', () => {
  assert.equal(canReadTask(operative, task, '11'), true);
  assert.equal(canReadTask(operative, { ...task, team_id: '8' }, '11'), false);
  assert.equal(canReadTask(operative, { ...task, clearance_level: 3 }, '11'), false);
  assert.equal(canReadTask(operative, { ...task, assigned_to: '19', created_by: '19' }, '11'), false);
});

test('commanders can read and update eligible team tasks but not beyond clearance', () => {
  const commander = { ...operative, role: 'commander', clearance_level: 4 };
  assert.equal(canReadTask(commander, { ...task, assigned_to: null }, '11'), true);
  assert.equal(canUpdateTask(commander, { ...task, assigned_to: null }, '11'), true);
  assert.equal(canReadTask(commander, { ...task, clearance_level: 5 }, '11'), false);
});

test('operatives may update only tasks assigned to them', () => {
  assert.equal(canUpdateTask(operative, task, '11'), true);
  assert.equal(canUpdateTask(operative, { ...task, assigned_to: '19' }, '11'), false);
});

test('channel access requires matching team, explicit channel membership, and sufficient clearance', () => {
  const channel = { id: '3', team_id: '7', clearance_level: 2 };
  assert.equal(canAccessChannel(operative, channel, { channel_id: '3' }), true);
  assert.equal(canAccessChannel(operative, channel, null), false);
  assert.equal(canAccessChannel({ ...operative, clearance_level: 1 }, channel, { channel_id: '3' }), false);
  assert.equal(canAccessChannel(operative, { ...channel, team_id: '8' }, { channel_id: '3' }), false);
});
