import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(repositoryRoot, "render-dist");
const publishedFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "icon-192.svg",
  "icon-512.svg",
  "rio-engine-web.mjs",
  "engine.mjs",
  "chat-preview.mjs"
];

rmSync(outputDirectory, { recursive: true, force: true });

for (const relativePath of publishedFiles) {
  const destination = resolve(outputDirectory, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(repositoryRoot, relativePath), destination);
}

console.log(`Prepared ${publishedFiles.length} public files in render-dist.`);
