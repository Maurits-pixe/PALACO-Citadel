import { readFileSync } from 'node:fs';
import { canonicalJSON, deepFreeze } from './integrity.mjs';

const KEYWORDS = new Set(['$schema', '$id', 'title', 'description', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum']);
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const pointer = (path, key) => path + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1');
const own = (object, key) => Object.hasOwn(object, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Reject unsupported or malformed schema constructs before evaluating a value. */
export function assertSchemaSupported(schema) {
  canonicalJSON(schema);
  const check = (node, path) => {
    if (!isObject(node)) throw new TypeError('SCHEMA_UNSUPPORTED at ' + path);
    for (const key of Object.keys(node)) if (!KEYWORDS.has(key)) throw new TypeError('SCHEMA_UNSUPPORTED at ' + pointer(path, key));
    if (own(node, 'type')) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      if (!types.length || types.some((type) => !TYPES.has(type)) || new Set(types).size !== types.length) throw new TypeError('SCHEMA_UNSUPPORTED type at ' + path);
    }
    for (const key of ['$schema', '$id', 'title', 'description']) if (own(node, key) && typeof node[key] !== 'string') throw new TypeError('SCHEMA_UNSUPPORTED at ' + pointer(path, key));
    if (own(node, 'enum') && (!Array.isArray(node.enum) || !node.enum.length || new Set(node.enum.map(canonicalJSON)).size !== node.enum.length)) throw new TypeError('SCHEMA_UNSUPPORTED enum at ' + path);
    if (own(node, 'required') && (!Array.isArray(node.required) || node.required.some((key) => typeof key !== 'string') || new Set(node.required).size !== node.required.length)) throw new TypeError('SCHEMA_UNSUPPORTED required at ' + path);
    if (own(node, 'properties')) {
      if (!isObject(node.properties)) throw new TypeError('SCHEMA_UNSUPPORTED properties at ' + path);
      for (const [key, child] of Object.entries(node.properties)) check(child, pointer(pointer(path, 'properties'), key));
    }
    if (own(node, 'additionalProperties') && typeof node.additionalProperties !== 'boolean') throw new TypeError('SCHEMA_UNSUPPORTED additionalProperties at ' + path);
    if (own(node, 'items')) check(node.items, pointer(path, 'items'));
    for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) if (own(node, key) && (!Number.isSafeInteger(node[key]) || node[key] < 0)) throw new TypeError('SCHEMA_UNSUPPORTED at ' + pointer(path, key));
    for (const key of ['minimum', 'maximum']) if (own(node, key) && (typeof node[key] !== 'number' || !Number.isFinite(node[key]))) throw new TypeError('SCHEMA_UNSUPPORTED at ' + pointer(path, key));
    for (const [minimum, maximum] of [['minItems', 'maxItems'], ['minLength', 'maxLength'], ['minimum', 'maximum']]) if (own(node, minimum) && own(node, maximum) && node[minimum] > node[maximum]) throw new TypeError('SCHEMA_UNSUPPORTED bounds at ' + path);
    if (own(node, 'uniqueItems') && typeof node.uniqueItems !== 'boolean') throw new TypeError('SCHEMA_UNSUPPORTED uniqueItems at ' + path);
    if (own(node, 'pattern')) {
      if (typeof node.pattern !== 'string') throw new TypeError('SCHEMA_UNSUPPORTED pattern at ' + path);
      try { new RegExp(node.pattern, 'u'); } catch { throw new TypeError('SCHEMA_UNSUPPORTED pattern at ' + path); }
    }
    if (own(node, 'format') && !['date-time', 'sha256', 'token64', 'commit-sha'].includes(node.format)) throw new TypeError('SCHEMA_UNSUPPORTED format at ' + path);
  };
  check(schema, '');
  return true;
}

function dateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

const formats = {
  'date-time': dateTime,
  sha256: (value) => /^sha256:[a-f0-9]{64}$/.test(value),
  token64: (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value),
  'commit-sha': (value) => /^[a-f0-9]{40}$/.test(value),
};
const matchesType = (value, type) => {
  if (type === 'null') return value === null;
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
};

/** The published subset is explicit; unsupported keywords are never silently ignored. */
export function validateWithSchema(schema, value) {
  const errors = [];
  try { assertSchemaSupported(schema); } catch { return { valid: false, errors: [{ path: '', code: 'SCHEMA_UNSUPPORTED' }] }; }
  try { canonicalJSON(value); } catch { return { valid: false, errors: [{ path: '', code: 'INVALID_JSON' }] }; }
  const fail = (path, code) => errors.push({ path, code });
  const visit = (node, input, path) => {
    if (own(node, 'type') && !(Array.isArray(node.type) ? node.type : [node.type]).some((type) => matchesType(input, type))) {
      fail(path, 'TYPE');
      return;
    }
    if (own(node, 'const') && canonicalJSON(input) !== canonicalJSON(node.const)) fail(path, 'CONST');
    if (own(node, 'enum') && !node.enum.some((allowed) => canonicalJSON(input) === canonicalJSON(allowed))) fail(path, 'ENUM');
    if (typeof input === 'string') {
      const length = Array.from(input).length;
      if (own(node, 'minLength') && length < node.minLength) fail(path, 'MIN_LENGTH');
      if (own(node, 'maxLength') && length > node.maxLength) fail(path, 'MAX_LENGTH');
      if (own(node, 'pattern') && !new RegExp(node.pattern, 'u').test(input)) fail(path, 'PATTERN');
      if (own(node, 'format') && !formats[node.format](input)) fail(path, 'FORMAT');
    }
    if (typeof input === 'number') {
      if (own(node, 'minimum') && input < node.minimum) fail(path, 'MINIMUM');
      if (own(node, 'maximum') && input > node.maximum) fail(path, 'MAXIMUM');
    }
    if (Array.isArray(input)) {
      if (own(node, 'minItems') && input.length < node.minItems) fail(path, 'MIN_ITEMS');
      if (own(node, 'maxItems') && input.length > node.maxItems) fail(path, 'MAX_ITEMS');
      if (node.uniqueItems && new Set(input.map(canonicalJSON)).size !== input.length) fail(path, 'UNIQUE_ITEMS');
      if (node.items) input.forEach((item, index) => visit(node.items, item, pointer(path, index)));
    }
    if (isObject(input)) {
      for (const key of node.required ?? []) if (!own(input, key)) fail(pointer(path, key), 'REQUIRED');
      const properties = node.properties ?? {};
      for (const key of Object.keys(input)) {
        if (own(properties, key)) visit(properties[key], input[key], pointer(path, key));
        else if (node.additionalProperties === false) fail(pointer(path, key), 'ADDITIONAL_PROPERTY');
      }
    }
  };
  visit(schema, value, '');
  return { valid: errors.length === 0, errors };
}

const load = (name) => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/' + name + '.json', import.meta.url), 'utf8'));
  assertSchemaSupported(schema);
  return deepFreeze(schema);
};
export const schemas = deepFreeze({
  manifest: load('elixer-manifest-v0.1'),
  request: load('elixer-runtime-request-v0.1'),
  result: load('elixer-runtime-result-v0.1'),
  policy: load('elixer-capability-policy-v0.1'),
  consent: load('elixer-consent-v0.1'),
  revocation: load('elixer-revocation-v0.1'),
  receipt: load('elixer-trace-receipt-v0.1'),
  surfaceBinding: load('elixer-surface-binding-v0.1'),
});
export const validateManifest = (value) => validateWithSchema(schemas.manifest, value);
export const validateRequest = (value) => validateWithSchema(schemas.request, value);
export const validateResult = (value) => validateWithSchema(schemas.result, value);
export const validatePolicy = (value) => validateWithSchema(schemas.policy, value);
export const validateConsent = (value) => validateWithSchema(schemas.consent, value);
export const validateRevocation = (value) => validateWithSchema(schemas.revocation, value);
export const validateTraceReceipt = (value) => validateWithSchema(schemas.receipt, value);
export const validateSurfaceBinding = (value) => validateWithSchema(schemas.surfaceBinding, value);
