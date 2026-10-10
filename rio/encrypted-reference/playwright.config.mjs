import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.mjs',workers:1,fullyParallel:false,timeout:60000,
  expect:{timeout:10000},outputDir:'../../artifacts/rio-encrypted-browser',reporter:'list',
  use:{browserName:'chromium',trace:'off',video:'off',screenshot:'off'}});
