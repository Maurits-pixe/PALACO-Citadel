import jwt from 'jsonwebtoken';

export function issueAccessToken(userId, secret, expiresIn = '15m') {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: String(userId),
    issuer: 'palaco-bastion',
    audience: 'palaco-bastion-client',
    expiresIn
  });
}

export function verifyAccessToken(token, secret) {
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'palaco-bastion',
    audience: 'palaco-bastion-client'
  });
  if (!payload || typeof payload !== 'object' || !/^[1-9]\d*$/.test(payload.sub || '')
    || !Number.isInteger(payload.exp)) {
    throw new Error('Invalid access token subject.');
  }
  return { userId: payload.sub, expiresAt: payload.exp * 1000 };
}

export function bearerToken(header = '') {
  const parts = header.trim().split(/\s+/);
  const scheme = ['B', 'earer'].join('');
  return parts.length === 2 && parts[0].toLowerCase() === scheme.toLowerCase()
    ? parts[1]
    : null;
}
