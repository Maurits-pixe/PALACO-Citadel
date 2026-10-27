import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {buildUnifiedPreview} from '../../scripts/build-rio-unified-preview.mjs';
import {defaultReviewPaths} from '../../scripts/serve-rio-unified-preview.mjs';
import {startRioBackendServer,readConfiguration} from './server.mjs';
const URL='https://abcdefghijklmnopqrst.supabase.co',USER='11111111-1111-4111-8111-111111111111',PERSON='22222222-2222-4222-8222-222222222222';
let active,closed;
test.beforeAll(async()=>{buildUnifiedPreview();active=await startRioBackendServer({...defaultReviewPaths(),port:0,configuration:readConfiguration({NODE_ENV:'test',RIO_SUPABASE_URL:URL,RIO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_SYNTHETIC_TEST_NOT_A_REAL_KEY_1234'})});closed=await startRioBackendServer({...defaultReviewPaths(),port:0,configuration:readConfiguration({NODE_ENV:'test'})});});
test.afterAll(async()=>{await active?.close();await closed?.close();});
async function provider(page){
 const calls=[],notes=[];let pendingSave,holdSave=false,revoked=false;
 const user={id:USER,email:'fixture@example.test',email_confirmed_at:'2026-10-27T00:00:00Z',is_anonymous:false,aud:'authenticated',role:'authenticated'};
 const jwt=[{alg:'HS256',typ:'JWT'},{sub:USER,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),session_id:PERSON}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.SYNTHETIC_SIGNATURE_NOT_VERIFIED';
 await page.route(URL+'/**',async route=>{
  const request=route.request(),url=new globalThis.URL(request.url()),path=url.pathname,data=request.postDataJSON();calls.push({path,method:request.method(),data});
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':active.origin,'Access-Control-Allow-Headers':'*'}});
  if(request.method()==='OPTIONS')return send({});
  if(path==='/auth/v1/otp')return send({});
  if(path==='/auth/v1/verify')return send({access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'SYNTHETIC_REFRESH',user});
  if(path==='/auth/v1/user')return send(user);
  if(path==='/auth/v1/logout')return send({});
  if(path==='/rest/v1/rpc/rio_current_person')return send(revoked?null:PERSON);
  if(path==='/rest/v1/rpc/rio_create_note'){
   const row={id:randomUUID(),title:data.p_title,body:data.p_body,client_request_id:data.p_client_request_id,created_at:new Date().toISOString()};notes.push(row);
   if(holdSave){pendingSave=()=>send([row]);return;}
   return send([row]);
  }
  if(path==='/rest/v1/rio_notes')return send(notes);
  throw Error('Unexpected synthetic provider request '+path);
 });
 return {calls,notes,hold(){holdSave=true;},release(){return pendingSave?.();},revoke(){revoked=true;},pending:()=>Boolean(pendingSave)};
}
async function login(page){
 await page.locator('#email').fill('fixture@example.test');await page.locator('#request-code').click();
 await expect(page.locator('#verify-form')).toBeVisible();await page.locator('#code').fill('123456');await page.locator('#verify-code').click();
 await expect(page.locator('#connection-label')).toHaveText('Verbonden met jouw RIO-account');
}
test('missing cloud configuration keeps fields closed; RIO entry preserves the source page',async({page,context})=>{
 await page.goto(closed.origin+'/rio/account/');await expect(page.locator('#connection-label')).toHaveText('Nog niet verbonden');await expect(page.locator('#email')).toBeDisabled();await expect(page.locator('#save-note')).toBeDisabled();
 await page.goto(closed.origin+'/');await page.locator('#memory-input').fill('TST-source-draft-never-transfer');
 const popup=context.waitForEvent('page');await page.locator('#rio-account-link').click();const account=await popup;await account.waitForLoadState();
 expect(account.url()).toBe(closed.origin+'/rio/account/');expect(await account.evaluate(()=>window.opener)).toBeNull();expect(await account.evaluate(()=>document.referrer)).toBe('');
 await expect(account.locator('#email')).toBeDisabled();await expect(page.locator('#memory-input')).toHaveValue('TST-source-draft-never-transfer');await account.close();
});
test('real bundled SDK uses explicit synthetic OTP and note consent, renders text safely and clears on logout',async({page})=>{
 const fake=await provider(page),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(active.origin+'/rio/account/');
 await expect(page.locator('#connection-label')).toHaveText('Accountomgeving beschikbaar');expect(fake.calls).toEqual([]);
 await login(page);expect(fake.calls.find(c=>c.path==='/auth/v1/otp').data.create_user).toBe(false);
 await page.locator('#note-title').fill('Een eigen gedachte');await page.locator('#note-body').fill('<img src=x onerror=alert(1)> Alleen testtekst.');await page.locator('#save-note').click();
 await expect(page.locator('#feedback')).toContainText('Vink aan');expect(fake.calls.some(c=>c.path.endsWith('/rio_create_note'))).toBe(false);
 await page.locator('#note-consent').check();await page.locator('#save-note').click();await expect(page.locator('#notes-list .note')).toHaveCount(1);
 await expect(page.locator('#notes-list')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('#notes-list img')).toHaveCount(0);
 const saved=fake.calls.find(c=>c.path.endsWith('/rio_create_note'));expect(Object.keys(saved.data).sort()).toEqual(['p_body','p_client_request_id','p_consent','p_title']);expect(saved.data.p_consent).toBe(true);
 await page.locator('#refresh-notes').click();await expect(page.locator('#notes-list .note')).toHaveCount(1);
 expect(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}))).toEqual({local:[],session:[]});
 await page.locator('#sign-out').click();await expect(page.locator('#notes-list .note')).toHaveCount(0);await expect(page.locator('#note-body')).toHaveValue('');await expect(page.locator('#note-body')).toBeDisabled();expect(fake.calls.filter(c=>c.path==='/auth/v1/logout')).toHaveLength(1);expect(errors).toEqual([]);
});
test('logout hides a late save result and a revoked person cannot reopen private notes',async({page})=>{
 const fake=await provider(page);await page.goto(active.origin+'/rio/account/');await login(page);
 await page.locator('#note-title').fill('Late test');await page.locator('#note-body').fill('TST-private-late');await page.locator('#note-consent').check();fake.hold();await page.locator('#save-note').click();await expect.poll(fake.pending).toBe(true);
 await page.locator('#sign-out').click();await fake.release();await expect(page.locator('#notes-list .note')).toHaveCount(0);await expect(page.locator('#connection-label')).toHaveText('Accountomgeving beschikbaar');
 fake.revoke();await page.locator('#email').fill('fixture@example.test');await page.locator('#request-code').click();await page.locator('#code').fill('123456');await page.locator('#verify-code').click();
 await expect(page.locator('#feedback')).toContainText('geen actieve');await expect(page.locator('#note-body')).toBeDisabled();await expect(page.locator('#notes-list .note')).toHaveCount(0);
});
test('personal workspace remains readable at 320px, double text and keyboard input',async({page})=>{
 await page.setViewportSize({width:320,height:760});await page.goto(closed.origin+'/rio/account/');
 await page.addStyleTag({content:'html {font-size:32px} body {font-size:2rem}'});
 const fit=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));expect(fit.width).toBeLessThanOrEqual(fit.viewport+1);
 await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
 const back=page.locator('footer a');await back.focus();const box=await back.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
});
