// EARTH-110: domain-separated, versioned Ed25519 signature envelope.
// Candidate protocol. Does not authorize any database mutation.
import {createPublicKey,verify} from 'node:crypto';
const DOMAIN=Buffer.from('PALACO/EARTH/AUDIT-RECEIPT/ED25519/v1\\0','utf8');
const HEX=/^[0-9a-f]{64}$/;
const B64=/^[A-Za-z0-9+/]{86}==$/;
export const EARTH110_PROTOCOL='EARTH-110-Ed25519-v1';
export function signatureMessage(receiptHash) {
 if(typeof receiptHash!=='string'||!HEX.test(receiptHash)) throw Error('INVALID_RECEIPT_DIGEST');
 return Buffer.concat([DOMAIN,Buffer.from(receiptHash,'hex')]);
}
export function verifySignatureEnvelope({receiptHash,envelope,trustAnchors,revokedKeys}={}) {
 if(!envelope||envelope.protocol!==EARTH110_PROTOCOL||typeof envelope.keyId!=='string'||!envelope.keyId||!B64.test(envelope.signature??'')) return Object.freeze({status:'HOLD',reason:'ENVELOPE_INVALID'});
 if(!(trustAnchors instanceof Map)||!(revokedKeys instanceof Set)||revokedKeys.has(envelope.keyId)) return Object.freeze({status:'HOLD',reason:'KEY_UNTRUSTED'});
 const pem=trustAnchors.get(envelope.keyId);
 if(typeof pem!=='string') return Object.freeze({status:'HOLD',reason:'KEY_MISSING'});
 try {
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=='ed25519'||!verify(null,signatureMessage(receiptHash),key,Buffer.from(envelope.signature,'base64'))) return Object.freeze({status:'HOLD',reason:'SIGNATURE_INVALID'});
  return Object.freeze({status:'SIGNATURE_MATCH',reason:null});
 } catch {return Object.freeze({status:'HOLD',reason:'VERIFICATION_ERROR'});}
}
