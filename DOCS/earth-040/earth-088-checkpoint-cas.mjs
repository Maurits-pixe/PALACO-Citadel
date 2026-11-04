// EARTH-088: compare-and-swap contract for trusted checkpoint stores.
// The adapter must implement a genuinely atomic transaction; this helper alone is not durable storage.
import {verifyMonotoneCheckpoint} from './earth-087-monotone-checkpoint.mjs';
export async function commitCheckpointCAS({store,chain,checkpoint,expectedVersion}) {
 if(!store||typeof store.read!=='function'||typeof store.compareAndSwap!=='function') return {status:'HOLD',reason:'ATOMIC_STORE_REQUIRED'};
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0) return {status:'HOLD',reason:'INVALID_EXPECTED_VERSION'};
 try {
  const current=await store.read();
  if(!current||current.version!==expectedVersion) return {status:'HOLD',reason:'CONCURRENT_UPDATE'};
  const floor=current.checkpoint;
  const checked=verifyMonotoneCheckpoint(chain,checkpoint,floor);
  if(checked.status!=='MONOTONE_CHECKPOINT_MATCH') return {status:'HOLD',reason:checked.reason};
  const written=await store.compareAndSwap(expectedVersion,Object.freeze({version:expectedVersion+1,checkpoint}));
  return written===true?{status:'COMMITTED',version:expectedVersion+1}:{status:'HOLD',reason:'CONCURRENT_UPDATE'};
 } catch {
  return {status:'HOLD',reason:'STORAGE_ERROR'};
 }
}
