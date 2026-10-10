import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRegistry, authorizeSeat, isSeat } from '../access-policy.mjs';

const ISSUER = 'https://identity.example.invalid/';
const NOW = Date.parse('2030-01-01T00:00:00Z');
const claims = { iss: ISSUER, sub: 'fixture-person-01' };
const member = (overrides = {}) => ({
  issuer: ISSUER,
  subject: 'fixture-person-01',
  seat: 'PALACO-AMB-01',
  status: 'enabled',
  expiresAt: '2030-06-01T00:00:00Z',
  ...overrides,
});
const registry = (members = [member()]) => ({ version: 1, members });

test('only the twelve canonical seat IDs are accepted', () => {
  for (let number = 1; number <= 12; number++) {
    assert.equal(isSeat('PALACO-AMB-' + String(number).padStart(2, '0')), true);
  }
  for (const value of [undefined, null, 1, '', 'PALACO-AMB-00', 'PALACO-AMB-13',
    'PALACO-AMB-1', 'palaco-amb-01', 'PALACO-AMB-01 ', '../PALACO-AMB-01']) {
    assert.equal(isSeat(value), false, String(value));
  }
});

test('an empty private registry grants access to nobody', () => {
  const parsed = parseRegistry(registry([]));
  assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-01', NOW), null);
});

test('an enabled immutable identity can access its own seat only', () => {
  const parsed = parseRegistry(JSON.stringify(registry()));
  assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-01', NOW).seat, 'PALACO-AMB-01');
  assert.equal(authorizeSeat(claims, parsed, undefined, NOW).seat, 'PALACO-AMB-01');
  assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-02', NOW), null);
  assert.equal(authorizeSeat(claims, parsed, '../PALACO-AMB-01', NOW), null);
});

test('no identity, a caller email, a wrong issuer or a different subject cannot authorize', () => {
  const parsed = parseRegistry(registry());
  for (const identity of [null, undefined, {}, { email: 'fixture@example.invalid' },
    { sub: claims.sub }, { iss: ISSUER }, { ...claims, sub: 'fixture-person-02' },
    { ...claims, iss: 'https://another-identity.example.invalid/' },
    { ...claims, iss: ISSUER.slice(0, -1) },
    { ...claims, sub: ['fixture-person-01'] }]) {
    assert.equal(authorizeSeat(identity, parsed, 'PALACO-AMB-01', NOW), null);
  }
});

test('reserved, pending, suspended and revoked records always deny access', () => {
  for (const status of ['reserved', 'pending', 'suspended', 'revoked']) {
    const parsed = parseRegistry(registry([member({ status })]));
    assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-01', NOW), null, status);
  }
});

test('expiration is exclusive, including the exact expiry instant', () => {
  const expiry = '2030-01-01T00:00:00Z';
  const parsed = parseRegistry(registry([member({ expiresAt: expiry })]));
  assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-01', NOW - 1).seat, 'PALACO-AMB-01');
  assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-01', NOW), null);
  assert.equal(authorizeSeat(claims, parsed, 'PALACO-AMB-01', NOW + 1), null);
});

test('replacement does not transfer an existing session to the successor', () => {
  const oldRegistry = parseRegistry(registry());
  const replacement = parseRegistry(registry([member({ subject: 'fixture-successor-01' })]));
  assert.ok(authorizeSeat(claims, oldRegistry, 'PALACO-AMB-01', NOW));
  assert.equal(authorizeSeat(claims, replacement, 'PALACO-AMB-01', NOW), null);
  assert.ok(authorizeSeat({ iss: ISSUER, sub: 'fixture-successor-01' },
    replacement, 'PALACO-AMB-01', NOW));
});

test('malformed registry data cannot be interpreted as an allowlist', () => {
  const invalid = [
    undefined, null, '{broken', [], {},
    { version: 2, members: [] },
    { version: 1, members: null },
    { version: 1, members: {} },
    { version: 1, members: [null] },
    registry([member({ issuer: 'http://identity.example.invalid/' })]),
    registry([member({ issuer: 'https://user:password@identity.example.invalid/' })]),
    registry([member({ subject: '' })]),
    registry([member({ seat: 'PALACO-AMB-13' })]),
    registry([member({ status: 'administrator' })]),
    registry([member({ expiresAt: 'never' })]),
    registry([member({ permissions: ['merge', 'release', 'execute'] })]),
    { ...registry(), unexpected: true },
  ];
  for (const input of invalid) {
    assert.throws(() => parseRegistry(input), 'invalid data: ' + JSON.stringify(input));
  }
});

test('duplicate seats and duplicate provider identities reject the whole registry', () => {
  assert.throws(() => parseRegistry(registry([
    member(), member({ subject: 'fixture-person-02' }),
  ])));
  assert.throws(() => parseRegistry(registry([
    member(), member({ seat: 'PALACO-AMB-02' }),
  ])));
  assert.throws(() => parseRegistry(registry([
    member(), member({ status: 'revoked' }),
  ])));
});
