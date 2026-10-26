import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    open: '/src/index.html'
  },
  build: {
    outDir: 'citadel/react',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.html'
      }
    }
  }
});
