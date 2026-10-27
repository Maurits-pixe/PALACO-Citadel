import assert from 'node:assert/strict';
import {readConfiguration} from './server.mjs';
const config=readConfiguration();
assert.equal(config.configured,true,'Configure the real project URL and publishable key first.');
const headers={apikey:config.publishableKey,Accept:'application/json'};
const settings=await fetch(config.url+'/auth/v1/settings',{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(settings.status,200,'Auth settings must be reachable over verified HTTPS.');
const auth=await settings.json(),checks=[];
for(const [route,method,body]of [
 ['/rest/v1/rio_notes?select=id&limit=1','GET',undefined],
 ['/rest/v1/rio_note_events?select=id&limit=1','GET',undefined],
 ['/rest/v1/rio_person_bindings?select=person_id&limit=1','GET',undefined],
 ['/rest/v1/rpc/rio_current_person','POST',{}],
 ['/rest/v1/rpc/rio_create_note','POST',{p_client_request_id:'00000000-0000-4000-8000-000000000000',p_title:'SYNTHETIC_DENIAL_PROBE',p_body:'No authenticated write is permitted.',p_consent:true}]
]){
 const response=await fetch(config.url+route,{method,headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
 const data=await response.json();assert.ok([401,403].includes(response.status),route+' must deny anonymous access');assert.equal(data.code,'42501',route+' must be a permission denial, not a missing schema/function');
 checks.push({route:route.split('?')[0],method,status:response.status,code:data.code});
}
console.log(JSON.stringify({schema:'rio-supabase-real-connection/1',status:'PASS',checkedAtUtc:new Date().toISOString(),projectUrl:config.url,publishableKeyOnly:true,tlsCertificateValidation:'default enabled',authSettingsReachable:true,emailProviderEnabled:auth.external?.email===true,signupDisabled:auth.disable_signup===true,anonymousAccessDenied:checks,authenticatedUserRoundTrip:'NOT_TESTED',emailSent:false,providerAIRequests:0}));
