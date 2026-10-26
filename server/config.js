import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

export function getConfig() {
  const jwtSecret = required('JWT_SECRET');
  if (Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return {
    databaseUrl: required('DATABASE_URL'),
    jwtSecret,
    allowedOrigins,
    host: process.env.HOST || '127.0.0.1',
    port
  };
}
