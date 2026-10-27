import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'browser.spec.mjs',fullyParallel:false,workers:1,retries:0,timeout:45000,forbidOnly:Boolean(process.env.CI),reporter:'line',outputDir:'../../artifacts/rio-backend-browser',
 use:{screenshot:'off',trace:'off',video:'off',launchOptions:process.env.RIO_BROWSER_EXECUTABLE?{executablePath:process.env.RIO_BROWSER_EXECUTABLE}:{}},
 projects:[{name:'mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},{name:'desktop',use:{browserName:'chromium',viewport:{width:1440,height:900}}}]
});
