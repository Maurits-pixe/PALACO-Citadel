import { createServer } from 'node:http';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { createBastionApp, attachBastionSockets, expireMessages } from './app.js';
import { getConfig } from './config.js';

const config = getConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const ioRef = { current: null };
const { app } = createBastionApp({
  pool,
  jwtSecret: config.jwtSecret,
  allowedOrigins: config.allowedOrigins,
  ioRef
});
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 16 * 1024
});
ioRef.current = io;
attachBastionSockets(io, { pool, jwtSecret: config.jwtSecret });

const expiryTimer = setInterval(() => {
  expireMessages(pool, io).catch(() => {
    console.error('Bastion message expiry job failed.');
  });
}, 1000);
expiryTimer.unref();

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(config.port, config.host, resolve);
});
console.log(`Bastion API listening on ${config.host}:${config.port}.`);

async function shutdown() {
  clearInterval(expiryTimer);
  await new Promise(resolve => io.close(resolve));
  await pool.end();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
