import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWithSchema, assertSchemaSupported, schemas, validateManifest, validateRequest, validatePolicy, validateConsent, validateRevocation } from '../src/contracts.mjs';
import { createLab } from '../src/fixtures.mjs';

test('all eight published contracts are supported by the actual validator', () => {
  assert.deepEqual(Object.keys(schemas).sort(), ['consent', 'manifest', 'policy', 'receipt', 'request', 'result', 'revocation', 'surfaceBinding'].sort());
  for (const schema of Object.values(schemas)) assert.doesNotThrow(() => assertSchemaSupported(schema));
});

test('synthetic laboratory inputs validate against their published contracts', () => {
  const lab = createLab();
  for (const [validate, value] of [
    [validateManifest, lab.manifest],
    [validateRequest, lab.request],
    [validatePolicy, lab.records.policy],
    [validateConsent, lab.records.consent],
    [validateRevocation, lab.records.revocation],
  ]) assert.deepEqual(validate(value), { valid: true, errors: [] });
});

test('missing authorization is different from an explicit absent reference', () => {
  const { request } = createLab();
  request.authorization = null;
  assert.equal(validateRequest(request).valid, true);
  delete request.authorization;
  const missing = validateRequest(request);
  assert.equal(missing.valid, false);
  assert.equal(missing.errors.some(error => error.path === '/authorization'), true);
  request.authorization = false;
  assert.equal(validateRequest(request).valid, false);
});

test('contracts reject extra privilege fields and unsupported operational states', () => {
  const lab = createLab();
  assert.equal(validateRequest({ ...lab.request, productionAuthority: true }).valid, false);
  assert.equal(validateManifest({ ...lab.manifest, activation: 'ACTIVE' }).valid, false);
  assert.equal(validateManifest({ ...lab.manifest, dataClassification: 'PRODUCTION' }).valid, false);
  assert.equal(validatePolicy({ ...lab.records.policy, allowedActions: ['EXECUTE'] }).valid, false);
  assert.equal(validateConsent({ ...lab.records.consent, scopes: ['calendar.write'] }).valid, false);
});

test('expiration fields require real ISO timestamps', () => {
  const { request } = createLab();
  for (const expiration of ['tomorrow', '2030-02-30T00:00:00.000Z', '2030-01-01', '']) {
    assert.equal(validateRequest({ ...request, expiration }).valid, false, expiration);
  }
});

test('unsupported schema keywords are rejected instead of silently ignored', () => {
  const unsupported = { type: 'string', customAuthorization: 'automatically-grant' };
  assert.throws(() => assertSchemaSupported(unsupported), TypeError);
  const result = validateWithSchema(unsupported, 'value');
  assert.equal(result.valid, false);
  assert.equal(result.errors.some(error => error.code === 'SCHEMA_UNSUPPORTED'), true);
});

test('validator rejects nested extra fields and cannot coerce a grant', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['consent'], properties: { consent: { type: 'object', additionalProperties: false, required: ['granted'], properties: { granted: { type: 'boolean' } } } } };
  assert.equal(validateWithSchema(schema, { consent: { granted: false } }).valid, true);
  assert.equal(validateWithSchema(schema, { consent: { granted: 'true' } }).valid, false);
  assert.equal(validateWithSchema(schema, { consent: { granted: false, authorizeExecution: true } }).valid, false);
  assert.equal(validateWithSchema(schema, {}).valid, false);
});
