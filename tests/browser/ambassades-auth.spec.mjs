import { test, expect } from '@playwright/test';

const seat01 = 'PALACO-AMB-01';
const seat02 = 'PALACO-AMB-02';
const me = {seat: seat01, access: 'personal-workspace-read-only', governanceAuthority: false, mergeAuthority: false, releaseAuthority: false, executionAuthority: false};
async function reply(route, body, status = 200) {
 await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
}

test('unavailable backend never enables login or a private workspace', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:false,available:false,authenticated:false}));
 await page.goto('/ambassades/toegang.html#' + seat01);
 await expect(page.locator('#access-state')).toHaveText('Persoonlijke toegang momenteel niet beschikbaar');
 await expect(page.locator('#sign-in')).toBeHidden();
 await expect(page.locator('#unavailable')).toBeDisabled();
 await expect(page.locator('#workspace')).toBeHidden();
});

test('configured sign-in uses a fixed same-origin seat target', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:true,available:true,authenticated:false}));
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
 await page.route('**/api/auth/status', route => reply(route, {configured:true,available:true,authenticated:true,seat:seat01}));
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
  ? {configured:true,available:true,authenticated:true,seat:seat01}
  : {configured:true,available:true,authenticated:false}));
 await page.route('**/api/me', route => reply(route, me));
 await page.goto('/ambassades/toegang.html#' + seat01);
 await expect(page.locator('#workspace')).toBeVisible();
 active = false;
 await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('#sign-in')).toBeVisible();
});

test('mobile and desktop access page fits the viewport', async ({page}) => {
 await page.route('**/api/auth/status', route => reply(route, {configured:false,available:false,authenticated:false}));
 await page.goto('/ambassades/toegang.html');
 await expect(page.locator('.seat')).toHaveCount(12);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
