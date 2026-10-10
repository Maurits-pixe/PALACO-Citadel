import { createHash } from 'node:crypto';

/** Deterministic JSON encoding for plain, finite JSON values. Rejects lossy coercions. */
export function canonicalJSON(value) {
  const ancestors = new Set();
  const encode = (input) => {
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new TypeError('JSON numbers must be finite');
      return JSON.stringify(input);
    }
    if (typeof input !== 'object') throw new TypeError('Unsupported JSON value');
    if (ancestors.has(input)) throw new TypeError('Cyclic JSON value');
    const prototype = Object.getPrototypeOf(input);
    if (Array.isArray(input) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('JSON containers must be plain objects or arrays');
    }
    ancestors.add(input);
    let result;
    if (Array.isArray(input)) {
      const keys = Reflect.ownKeys(input);
      if (keys.length !== input.length + 1 || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length))) {
        throw new TypeError('JSON arrays must be dense and have no extra properties');
      }
      const values = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new TypeError('JSON arrays must contain data properties');
        values.push(encode(descriptor.value));
      }
      result = '[' + values.join(',') + ']';
    } else {
      const keys = Reflect.ownKeys(input);
      if (keys.some((key) => typeof key !== 'string')) throw new TypeError('JSON objects cannot have symbol keys');
      result = '{' + keys.sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('JSON objects must contain enumerable data properties');
        return JSON.stringify(key) + ':' + encode(descriptor.value);
      }).join(',') + '}';
    }
    ancestors.delete(input);
    return result;
  };
  return encode(value);
}

export function packageDigest(value) {
  return 'sha256:' + createHash('sha256').update(canonicalJSON(value), 'utf8').digest('hex');
}

export function deepFreeze(value) {
  canonicalJSON(value);
  const freeze = (input) => {
    if (input && typeof input === 'object') {
      for (const key of Object.keys(input)) freeze(Object.getOwnPropertyDescriptor(input, key).value);
      Object.freeze(input);
    }
    return input;
  };
  return freeze(value);
}
