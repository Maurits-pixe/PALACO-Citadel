import { test, expect } from '@playwright/test';

const APPROVED_SECURITY = Object.freeze({required:true,available:true,outcome:'APPROVED',reason:null,loginAllowed:true,signupAllowed:true});
const HOLD_SECURITY = Object.freeze({required:true,available:false,outcome:'HOLD',reason:'TRUSTED_SAFETY_APPROVAL_MISSING',loginAllowed:false,signupAllowed:false});
// Explicit browser fixtures isolate portal rendering; they do not approve the deployed server.

const seat01 = 'PALACO-AMB-01';
const seat02 = 'PALACO-AMB-02';
const me = {seat: seat01, access: 'personal-workspace-read-only', governanceAuthority: false, mergeAuthority: false, releaseAuthority: false, executionAuthority: false};
async function reply(route, body, status = 200) {
 await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
}

test('unavailable backend never enables login or a private workspace', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:false,available:false,authenticated:false,securityApproval:APPROVED_SECURITY}));
 await page.goto('/ambassades/toegang.html#' + seat01);
 await expect(page.locator('#access-state')).toHaveText('Persoonlijke toegang momenteel niet beschikbaar');
 await expect(page.locator('#sign-in')).toBeHidden();
 await expect(page.locator('#unavailable')).toBeDisabled();
 await expect(page.locator('#workspace')).toBeHidden();
});

test('configured sign-in uses a fixed same-origin seat target', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:true,available:true,authenticated:false,securityApproval:APPROVED_SECURITY}));
 await page.goto('/ambassades/toegang.html#' + seat01);
 await expect(page.locator('#sign-in')).toHaveAttribute('href', '/ambassades/login?seat=' + seat01);
 await expect(page.locator('#workspace')).toBeHidden();
 await page.locator('.seat[href="#' + seat02 + '"]').click();
 await expect(page.locator('#sign-in')).toHaveAttribute('href', '/ambassades/login?seat=' + seat02);
 await page.goto('/ambassades/toegang.html#https://outside.invalid');
 await expect(page.locator('#access-state')).toHaveText('Kies eerst je ambassadepost');
 await expect(page.locator('#sign-in')).toBeHidden();
});

test('only the server-assigned seat is shown and another selected seat is denied', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:true,available:true,authenticated:true,seat:seat01,securityApproval:APPROVED_SECURITY}));
 await page.route('**/api/me', route => reply(route, me));
 await page.goto('/ambassades/toegang.html');
 await expect(page.locator('#workspace')).toBeVisible();
 await expect(page.locator('#workspace-seat')).toHaveText('Gekoppelde zetel: ' + seat01);
 await page.locator('.seat[href="#' + seat02 + '"]').click();
 await expect(page.locator('#access-state')).toHaveText('Geen toegang tot deze post');
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('#sign-in')).toBeHidden();
});

test('current denial replaces a previously visible personal workspace', async ({page}) => {
 let active = true;
 await page.route('**/api/auth/status', route => reply(route, active
  ? {configured:true,available:true,authenticated:true,seat:seat01,securityApproval:APPROVED_SECURITY}
  : {configured:true,available:true,authenticated:false,securityApproval:APPROVED_SECURITY}));
 await page.route('**/api/me', route => reply(route, me));
 await page.goto('/ambassades/toegang.html#' + seat01);
 await expect(page.locator('#workspace')).toBeVisible();
 active = false;
 await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('#sign-in')).toBeVisible();
});

test('mobile and desktop access page fits the viewport', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:false,available:false,authenticated:false,securityApproval:APPROVED_SECURITY}));
 await page.goto('/ambassades/toegang.html');
 await expect(page.locator('.seat')).toHaveCount(12);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mandatory approval rejects absent, malformed and required-false readiness despite a claimed seat', async ({page}) => {
 let approval;
 let meReads = 0;
 await page.route('**/api/auth/status', route => reply(route, {
  configured:true,available:true,authenticated:true,seat:seat01,
  ...(approval === undefined ? {} : {securityApproval:approval}),
 }));
 await page.route('**/api/me', route => {meReads += 1; return reply(route,me);});
 for (const value of [
  undefined, null, true, [],
  {...APPROVED_SECURITY,required:false},
  {...APPROVED_SECURITY,outcome:'PASS'},
  {...APPROVED_SECURITY,extra:'unexpected'},
  {...APPROVED_SECURITY,signupAllowed:false},
  HOLD_SECURITY,
 ]) {
  approval = value;
  await page.goto('/ambassades/toegang.html#' + seat01);
  await expect(page.locator('#access-state')).toHaveText('Veiligheidsgoedkeuring nog niet beschikbaar');
  await expect(page.locator('#sign-in')).toBeHidden();
  await expect(page.locator('#sign-in')).not.toHaveAttribute('href', /login/);
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#unavailable')).toBeDisabled();
  await expect(page.locator('a[href*="signup"]')).toHaveCount(0);
 }
 expect(meReads).toBe(0);
});

test('revoked approval closes an existing workspace and retains an available logout action', async ({page}) => {
 let approved = true;
 let logouts = 0;
 await page.route('**/api/auth/status', route => reply(route,{
  configured:true,available:approved,authenticated:approved, ...(approved ? {seat:seat01}:{}),
  securityApproval:approved ? APPROVED_SECURITY : HOLD_SECURITY,
 }));
 await page.route('**/api/me',route=>reply(route,me));
 await page.route('**/logout',route=>{
  expect(route.request().method()).toBe('POST');logouts+=1;
  return route.fulfill({status:204,body:''});
 });
 await page.goto('/ambassades/toegang.html#'+seat01);
 await expect(page.locator('#workspace')).toBeVisible();
 approved=false;
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('#access-state')).toHaveText('Veiligheidsgoedkeuring nog niet beschikbaar');
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('#sign-in')).toBeHidden();
 await expect(page.locator('#sign-out')).toBeVisible();
 await page.locator('#sign-out').click();
 await expect(page.locator('#access-state')).toHaveText('Je sessie is afgesloten');
 expect(logouts).toBe(1);
});

test('a safety readiness outage hides access and preserves logout for a known configured session', async ({page}) => {
 let outage=false;
 let logouts=0;
 await page.route('**/api/auth/status',route=>outage ? route.abort() : reply(route,{
  configured:true,available:true,authenticated:true,seat:seat01,securityApproval:APPROVED_SECURITY,
 }));
 await page.route('**/api/me',route=>reply(route,me));
 await page.route('**/logout',route=>{logouts+=1;return route.fulfill({status:204,body:''});});
 await page.goto('/ambassades/toegang.html#'+seat01);
 await expect(page.locator('#workspace')).toBeVisible();
 outage=true;
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('#access-state')).toHaveText('Veiligheidsgoedkeuring nog niet beschikbaar');
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('#sign-in')).toBeHidden();
 await expect(page.locator('#sign-out')).toBeVisible();
 await page.locator('#sign-out').click();
 await expect(page.locator('#access-state')).toHaveText('Je sessie is afgesloten');
 expect(logouts).toBe(1);
});

test('a first-load safety outage keeps login and signup closed without claiming approval', async ({page}) => {
 await page.route('**/api/auth/status',route=>route.abort());
 await page.goto('/ambassades/toegang.html#'+seat01);
 await expect(page.locator('#access-state')).toHaveText('Veiligheidsgoedkeuring nog niet beschikbaar');
 await expect(page.locator('#sign-in')).toBeHidden();
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('a[href*="signup"]')).toHaveCount(0);
});
