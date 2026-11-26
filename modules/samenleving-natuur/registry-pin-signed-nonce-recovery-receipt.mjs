import {createHash,createPublicKey,verify} from 'node:crypto';

export const SIGNED_NONCE_RECEIPT_SCHEMA='palaco-citadel-signed-nonce-recovery-receipt-v1';
const DOMAIN=Buffer.from('PALACO-CITADEL-SIGNED-NONCE-RECOVERY-RECEIPT-V1\n');
const HEX=/^[0-9a-f]{64}$/;
const FIELDS=['schema','registryKey','nonceSha256','readerId','epoch','anchorSha256','evidenceSha256','receiptSha256'];
const ENVELOPE=['receipt','signerId','signerPublicJwk','expectedSignerFingerprint','signatureBase64Url'];
const EXPECTED=['registryKey','nonceSha256','readerId','epoch','anchorSha256','evidenceSha256'];
const deny=reason=>({schema:SIGNED_NONCE_RECEIPT_SCHEMA,receiptValid:false,reason,
 trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
 executionAllowed:false,releaseAllowed:false});
function exact(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return null;
 const names=Reflect.ownKeys(o);
 if(names.length!==fields.length||names.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
 const out={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!Object.hasOwn(d,'value'))return null;out[k]=d.value;}
 return out;
}
const id=s=>typeof s==='string'&&/^[a-z0-9-]{3,80}$/.test(s);
const hex=s=>typeof s==='string'&&HEX.test(s);
const valid=x=>x&&id(x.registryKey)&&id(x.readerId)&&Number.isSafeInteger(x.epoch)&&
 x.epoch>0&&[x.nonceSha256,x.anchorSha256,x.evidenceSha256].every(hex);
export function computeNonceRecoveryReceiptDigest(receipt){
 const x=exact(receipt,FIELDS);
 if(!x||x.schema!==SIGNED_NONCE_RECEIPT_SCHEMA||!valid(x))return null;
 const parts=[x.registryKey,x.nonceSha256,x.readerId,String(x.epoch),x.anchorSha256,x.evidenceSha256];
 return createHash('sha256').update('PALACO-CITADEL-NONCE-RECEIPT-V1\n'+parts.join('\n')).digest('hex');
}
/**
 * Verifies an independently signed representation of a committed nonce
 * receipt. All expected fields and key pins are caller provided. Does not
 * independently query storage or prove that signing occurred after commit.
 */
export function inspectSignedNonceRecoveryReceipt(input={}){
 try{
  const x=exact(input,['envelope','expectedReceipt','expectedSignerId','expectedSignerFingerprint']);
  if(!x)return deny('INVALID_INPUT');
  const e=exact(x.envelope,ENVELOPE);
  const receipt=e&&exact(e.receipt,FIELDS);
  const expected=exact(x.expectedReceipt,EXPECTED);
  const key=e&&exact(e.signerPublicJwk,['kty','crv','x','y']);
  if(!e||!receipt||!expected||!key||
   receipt.schema!==SIGNED_NONCE_RECEIPT_SCHEMA||!valid(receipt)||!valid(expected)||
   !hex(receipt.receiptSha256)||!id(e.signerId)||!id(x.expectedSignerId)||
   !hex(e.expectedSignerFingerprint)||!hex(x.expectedSignerFingerprint)||
   key.kty!=='EC'||key.crv!=='P-256'||
   typeof key.x!=='string'||typeof key.y!=='string'||
   !/^[A-Za-z0-9_-]{43}$/.test(key.x)||!/^[A-Za-z0-9_-]{43}$/.test(key.y)||
   typeof e.signatureBase64Url!=='string'||!/^[A-Za-z0-9_-]{11,107}$/.test(e.signatureBase64Url))
   return deny('INVALID_RECEIPT_EVIDENCE');
  if(EXPECTED.some(k=>receipt[k]!==expected[k]))return deny('RECEIPT_EXPECTATION_MISMATCH');
  const digest=computeNonceRecoveryReceiptDigest(receipt);
  if(digest!==receipt.receiptSha256)return deny('RECEIPT_DIGEST_MISMATCH');
  if(e.signerId!==x.expectedSignerId||
   e.expectedSignerFingerprint!==x.expectedSignerFingerprint)
   return deny('SIGNER_PIN_MISMATCH');
  const publicKey=createPublicKey({format:'jwk',key});
  if(publicKey.asymmetricKeyType!=='ec'||
   publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1'||
   createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex')!==
    x.expectedSignerFingerprint)return deny('SIGNER_KEY_SUBSTITUTION');
  const signature=Buffer.from(e.signatureBase64Url,'base64url');
  if(signature.length<8||signature.length>80||
   signature.toString('base64url')!==e.signatureBase64Url)
   return deny('INVALID_SIGNATURE_ENCODING');
  const signed=Buffer.from(JSON.stringify({receipt,signerId:e.signerId}));
  if(!verify('sha256',Buffer.concat([DOMAIN,signed]),publicKey,signature))
   return deny('INVALID_RECEIPT_SIGNATURE');
  return {schema:SIGNED_NONCE_RECEIPT_SCHEMA,receiptValid:true,
   receiptSha256:receipt.receiptSha256,nonceSha256:receipt.nonceSha256,
   signerId:e.signerId,unresolvedGates:['INDEPENDENT_COMMITTED_STORAGE_READ',
    'PROOF_OF_SIGN_AFTER_COMMIT','TRUSTED_SIGNER_CUSTODY',
    'FRESH_REVOCATION','EXTERNALLY_IMMUTABLE_RECEIPT_REGISTER'],
   trust:'NOT_ESTABLISHED',authorization:'DENY',stateChanged:false,
   executionAllowed:false,releaseAllowed:false};
 }catch{return deny('MALFORMED_UNTRUSTED_RECEIPT');}
}
