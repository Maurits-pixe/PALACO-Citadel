import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'*.spec.mjs',fullyParallel:false,workers:1,timeout:30000,
  reporter:'line',outputDir:'../../artifacts/rio-start-browser',
  use:{trace:'off',video:'off',screenshot:'off'},
  projects:[{name:'mobile',use:{browserName:'chromium',viewport:{width:390,height:844}}},
    {name:'desktop',use:{browserName:'chromium',viewport:{width:1440,height:900}}}]
});
