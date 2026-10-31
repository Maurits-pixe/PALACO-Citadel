import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const clientRoot = fileURLToPath(new URL('./bastion/client/', import.meta.url));

export default defineConfig({
  root: clientRoot,
  base: './',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../../citadel/bastion-app',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/bastion.js',
        assetFileNames: asset => asset.name?.endsWith('.css')
          ? 'assets/bastion.css'
          : 'assets/[name]-[hash][extname]'
      }
    }
  }
});
