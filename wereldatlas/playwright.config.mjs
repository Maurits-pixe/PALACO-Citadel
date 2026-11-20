import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir: ".",
 testMatch: "atlas.browser.spec.mjs",
 fullyParallel: false,
 forbidOnly: Boolean(process.env.CI),
 retries: 0,
 reporter: "line",
 use: {baseURL:"http://127.0.0.1:4173",trace:"retain-on-failure"},
 projects:[
  {name:"desktop-chromium",use:{browserName:"chromium",viewport:{width:1440,height:900}}},
  {name:"mobile-chromium",use:{browserName:"chromium",viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
 ],
 webServer:{cwd:process.cwd(),command:"python3 -m http.server 4173 --bind 127.0.0.1",url:"http://127.0.0.1:4173",reuseExistingServer:!process.env.CI,timeout:20000}
});
