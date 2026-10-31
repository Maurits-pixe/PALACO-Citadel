import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const mkcertKey = resolve('localhost+2-key.pem');
const mkcertCert = resolve('localhost+2.pem');
const hasMkcertPair = existsSync(mkcertKey) && existsSync(mkcertCert);

export default defineConfig(({ command }) => {
  if (command === 'serve' && !hasMkcertPair) {
    throw new Error('Local mkcert certificates are required. Run `mkcert -install` and `mkcert localhost 127.0.0.1 ::1` from the repository root.');
  }

  return {
    root: 'launcher-vue',
    envDir: process.cwd(),
    base: command === 'build' ? '/citadel/' : '/',
    plugins: [vue()],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      ...(hasMkcertPair ? {
        https: {
          key: readFileSync(mkcertKey),
          cert: readFileSync(mkcertCert)
        }
      } : {})
    },
    build: {
      outDir: '../citadel',
      emptyOutDir: false,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          entryFileNames: 'launcher.js',
          chunkFileNames: 'launcher-chunk.js',
          assetFileNames: assetInfo => assetInfo.name?.endsWith('.css') ? 'assets/launcher.css' : 'assets/[name][extname]'
        }
      }
    }
  };
});
