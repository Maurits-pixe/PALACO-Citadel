import basicSsl from '@vitejs/plugin-basic-ssl';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: 'launcher-vue',
  base: command === 'build' ? '/citadel/' : '/',
  plugins: [vue(), basicSsl()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: '../citadel',
    emptyOutDir: false,
    assetsDir: '',
    rollupOptions: {
      output: {
        entryFileNames: 'launcher.js',
        chunkFileNames: 'launcher-chunk.js',
        assetFileNames: assetInfo => assetInfo.name?.endsWith('.css') ? 'launcher.css' : '[name][extname]'
      }
    }
  }
}));
