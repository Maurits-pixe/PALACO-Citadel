import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const sourceRoot = fileURLToPath(new URL('./src/', import.meta.url));
const previewFiles = new Map([
  ['/citadel/iii6v9/', 'citadel/iii6v9/index.html'],
  ['/citadel/iii6v9/index.html', 'citadel/iii6v9/index.html'],
  ['/citadel/iii6v9/iii6v9.css', 'citadel/iii6v9/iii6v9.css'],
  ['/citadel/iii6v9/iii6v9.js', 'citadel/iii6v9/iii6v9.js'],
  ['/citadel/bastion/', 'citadel/bastion/index.html'],
  ['/citadel/bastion/index.html', 'citadel/bastion/index.html'],
  ['/citadel/bastion/bastion.css', 'citadel/bastion/bastion.css'],
  ['/citadel/bastion/bastion.js', 'citadel/bastion/bastion.js'],
  ['/citadel/aegis/', 'citadel/aegis/index.html'],
  ['/citadel/aegis/index.html', 'citadel/aegis/index.html'],
  ['/citadel/aegis/aegis.css', 'citadel/aegis/aegis.css'],
  ['/citadel/aegis/aegis.js', 'citadel/aegis/aegis.js']
]);

export default defineConfig({
  root: sourceRoot,
  base: './',
  plugins: [{
    name: 'serve-existing-citadel-previews',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const previewFile = previewFiles.get(pathname);
        if (!previewFile || request.method !== 'GET') {
          next();
          return;
        }
        try {
          const content = await readFile(new URL(`./${previewFile}`, import.meta.url));
          const contentType = pathname.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : pathname.endsWith('.js')
              ? 'text/javascript; charset=utf-8'
              : 'text/html; charset=utf-8';
          response.setHeader('Content-Type', contentType);
          response.end(content);
        } catch {
          response.statusCode = 404;
          response.end('Not found');
        }
      });
    }
  }],
  build: {
    outDir: '../citadel/react',
    emptyOutDir: true
  }
});
