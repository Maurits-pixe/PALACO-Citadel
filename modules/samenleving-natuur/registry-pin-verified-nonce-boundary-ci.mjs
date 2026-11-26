#!/usr/bin/env node
// Disposable CI-only integration harness. Not an HTTP service or production writer.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {inspectVerifiedAnchorNonceIntent} from './registry-pin-verified-anchor-nonce-intent.mjs';
import {ANCHOR_OBSERVATION_SCHEMA} from './registry-pin-signed-anchor-observation.mjs';
if(process.env.CITADEL_EPHEMERAL_CI_ONLY!=='1'||
 process.env.PGHOST!=='127.0.0.1'||process.env.PGPORT!=='5432'||
 process.env.PGDATABASE!=='postgres'){
 throw Error('DENY: isolated disposable PostgreSQL CI required');
}
function psql(sql){
 const r=spawnSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{
  input:sql,encoding:'utf8',timeout:15000
 });
 if(r.status!==0)throw Error('fixture PostgreSQL failed: '+(r.stderr||r.error||r.status));
 return r.stdout.trim();
}
const schema='citadel_verified_nonce_boundary_ci';
const setup=[
 'CREATE SCHEMA '+schema+';',
 'CREATE TABLE '+schema+'.consumed (',
 'registry_key text NOT NULL, nonce_sha256 char(64) NOT NULL,',
 'reader_id text NOT NULL, observation_sha256 char(64) NOT NULL,',
 'anchor_sha256 char(64) NOT NULL, epoch bigint NOT NULL,',
 'PRIMARY KEY (registry_key, nonce_sha256));'
].join('\n');
const signer=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fingerprint=k=>createHash('sha256')
 .update(k.publicKey.export({format:'der',type:'spki'})).digest('hex');
const publicJwk=k=>{
 const j=k.publicKey.export({format:'jwk'});
 return {kty:'EC',crv:'P-256',x:j.x,y:j.y};
};
function make(nonce='b',key=signer){
 const o={schema:ANCHOR_OBSERVATION_SCHEMA,registryKey:'citadel-draft',
  epoch:8,anchorSha256:'a'.repeat(64),nonceSha256:nonce.repeat(64),
  observedAtUtc:'2026-11-26T09:00:00.000Z',
  expiresAtUtc:'2026-11-26T09:01:00.000Z'};
 const readerId='reader-one';
 const msg=Buffer.from(JSON.stringify({observation:o,readerId}));
 const signatureBase64Url=sign('sha256',Buffer.concat([
  Buffer.from('PALACO-CITADEL-ANCHOR-OBSERVATION-V1\n'),msg]),
  key.privateKey).toString('base64url');
 return {envelope:{observation:o,readerId,
  readerPublicJwk:publicJwk(signer),
  expectedReaderFingerprint:fingerprint(signer),
  signatureBase64Url},
  expectedRegistryKey:o.registryKey,expectedEpoch:o.epoch,
  expectedAnchorSha256:o.anchorSha256,expectedNonceSha256:o.nonceSha256,
  expectedReaderId:readerId,expectedReaderFingerprint:fingerprint(signer),
  nowUtc:'2026-11-26T09:00:30.000Z',maxAgeMs:60000};
}
// All SQL variables are values returned by verified evidence and then checked
// again against deliberately narrow ASCII alphabets before SQL construction.
function consumeIfVerified(input){
 const inspected=inspectVerifiedAnchorNonceIntent(input);
 if(!inspected.intentValid)return 'DENY_UNVERIFIED';
 const p=inspected.proposedNonceConsumption;
 const id=/^[a-z0-9-]{3,80}$/,hex=/^[0-9a-f]{64}$/;
 if(!id.test(p.registryKey)||!id.test(p.readerId)||
  ![p.nonceSha256,p.observationSha256,p.anchorSha256].every(x=>hex.test(x))||
  !Number.isSafeInteger(p.epoch)||p.epoch<1)throw Error('DENY malformed intent');
 const values=[p.registryKey,p.nonceSha256,p.readerId,p.observationSha256,
  p.anchorSha256].map(x=>"'"+x+"'").concat([String(p.epoch)]);
 const sql='WITH inserted AS (INSERT INTO '+schema+
  '.consumed VALUES ('+values.join(',')+') ON CONFLICT (registry_key,nonce_sha256) '+
  "DO NOTHING RETURNING 1) SELECT CASE WHEN EXISTS(SELECT 1 FROM inserted) "+
  "THEN 'CONSUMED' ELSE 'DENY_NONCE_REPLAY' END;";
 return psql(sql);
}
try{
 psql(setup);
 const genuine=make();
 const tampered=make();
 tampered.envelope.observation.anchorSha256='f'.repeat(64);
 assert.equal(consumeIfVerified(tampered),'DENY_UNVERIFIED');
 const forged=make('b',other);
 assert.equal(consumeIfVerified(forged),'DENY_UNVERIFIED');
 const expired=make();
 expired.nowUtc='2026-11-26T09:01:00.000Z';
 assert.equal(consumeIfVerified(expired),'DENY_UNVERIFIED');
 const wrongChallenge=make();
 wrongChallenge.expectedNonceSha256='c'.repeat(64);
 assert.equal(consumeIfVerified(wrongChallenge),'DENY_UNVERIFIED');
 assert.equal(psql('SELECT count(*) FROM '+schema+'.consumed;'),'0',
  'invalid signed evidence must never consume any nonce');
 assert.equal(consumeIfVerified(genuine),'CONSUMED');
 assert.equal(consumeIfVerified(genuine),'DENY_NONCE_REPLAY');
 const resignedSameClaim=make();
 const first=inspectVerifiedAnchorNonceIntent(genuine);
 const second=inspectVerifiedAnchorNonceIntent(resignedSameClaim);
 assert.equal(first.proposedNonceConsumption.observationSha256,
  second.proposedNonceConsumption.observationSha256);
 assert.equal(consumeIfVerified(resignedSameClaim),'DENY_NONCE_REPLAY');
 const next=make('c');
 assert.equal(consumeIfVerified(next),'CONSUMED');
 assert.equal(psql('SELECT count(*) FROM '+schema+'.consumed;'),'2');
 const stored=psql('SELECT observation_sha256 FROM '+schema+
  ".consumed WHERE nonce_sha256='"+'b'.repeat(64)+"';");
 assert.equal(stored,first.proposedNonceConsumption.observationSha256);
 console.log('PASS: verified signed evidence precedes atomic replay consumption; HOLD only');
}finally{
 psql('DROP SCHEMA IF EXISTS '+schema+' CASCADE;');
}
