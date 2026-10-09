export const SEAT_PATTERN = /^PALACO-AMB-(?:0[1-9]|1[0-2])$/;

export function isSeat(value) {
  return typeof value === 'string' && SEAT_PATTERN.test(value);
}

function validIssuer(value) {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !value.includes('?') && !value.includes('#');
  } catch {
    return false;
  }
}

const statuses = new Set(['enabled', 'reserved', 'pending', 'suspended', 'revoked']);
const memberKeys = new Set(['issuer', 'subject', 'seat', 'status', 'expiresAt']);

export function parseRegistry(input) {
  const invalid = () => { throw new TypeError('Invalid private membership registry.'); };
  let registry;
  try { registry = typeof input === 'string' ? JSON.parse(input) : input; } catch { invalid(); }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)
      || registry.version !== 1 || !Array.isArray(registry.members) || registry.members.length > 12
      || Object.keys(registry).some(key => !['version', 'members'].includes(key))) invalid();

  const seats = new Set();
  const identities = new Set();
  const members = registry.members.map(member => {
    if (!member || typeof member !== 'object' || Array.isArray(member)
        || Object.keys(member).some(key => !memberKeys.has(key))
        || !validIssuer(member.issuer) || !isSeat(member.seat) || !statuses.has(member.status)
        || typeof member.subject !== 'string' || !member.subject.trim() || member.subject.length > 255) invalid();
    const identity = JSON.stringify([member.issuer, member.subject]);
    if (seats.has(member.seat) || identities.has(identity)) invalid();
    seats.add(member.seat);
    identities.add(identity);
    if (member.expiresAt !== undefined && (
      typeof member.expiresAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(member.expiresAt)
      || !Number.isFinite(Date.parse(member.expiresAt))
    )) invalid();
    return Object.freeze({ ...member });
  });
  return Object.freeze(members);
}

// Claims are accepted here only from the OIDC middleware's validated session.
export function authorizeSeat(claims, members, requestedSeat, now = Date.now()) {
  if (!claims || typeof claims.iss !== 'string' || typeof claims.sub !== 'string'
      || !Array.isArray(members) || !Number.isFinite(now)
      || (requestedSeat !== undefined && !isSeat(requestedSeat))) return null;
  const matches = members.filter(member => member.issuer === claims.iss && member.subject === claims.sub);
  if (matches.length !== 1) return null;
  const member = matches[0];
  if (member.status !== 'enabled' || !isSeat(member.seat)
      || (requestedSeat !== undefined && requestedSeat !== member.seat)
      || (member.expiresAt !== undefined && !(Date.parse(member.expiresAt) > now))) return null;
  return member;
}
