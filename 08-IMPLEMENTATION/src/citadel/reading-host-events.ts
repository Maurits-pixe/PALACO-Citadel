/**
 * CITADEL-READING-HOST-EVENTS-001
 * Host-supplied synchronous BEFORE-change events; no guessed PALACO APIs.
 */
import { createReadingHostBridge, type ReadingBridgeResult } from "./reading-host-bridge";
import type { ReadingLifecycleChange } from "./reading-lifecycle";
import type { ReadingMountOptions } from "./reading-mount";

const CHANGES: readonly ReadingLifecycleChange[] = [
  "logout", "session-changed", "permissions-changed", "route-replaced", "reader-closed",
];

export interface ReadingBeforeChangeSource {
  /** Must notify BEFORE the real router/session/permission mutation. */
  subscribeBeforeChange(handler: (change: ReadingLifecycleChange) => void): () => void;
}

export interface ConnectedReadingHost {
  activate(authorizeAndResolve: () => Promise<ReadingMountOptions | null>): Promise<ReadingBridgeResult>;
  beforeHostChange(change: ReadingLifecycleChange): void;
  dispose(): void;
}

/** Connect only after the real host exposes an authenticated event source. */
export function connectReadingHostEvents(source: ReadingBeforeChangeSource): ConnectedReadingHost {
  const bridge = createReadingHostBridge();
  let closed = false;
  let unsubscribe: (() => void) | null = null;

  const onBeforeChange = (change: ReadingLifecycleChange): void => {
    if (closed) return;
    // Invalid event types also revoke this view's previous context.
    bridge.beforeHostChange(CHANGES.includes(change) ? change : "session-changed");
  };

  try {
    const release = source.subscribeBeforeChange(onBeforeChange);
    if (typeof release !== "function") throw new Error("CITADEL_READING_INVALID_UNSUBSCRIBE");
    unsubscribe = release;
  } catch (error) {
    closed = true;
    bridge.dispose();
    throw error;
  }

  return {
    activate(callback): Promise<ReadingBridgeResult> {
      return closed ? Promise.resolve({ kind: "stale" }) : bridge.activate(callback);
    },
    beforeHostChange(change): void { onBeforeChange(change); },
    dispose(): void {
      if (closed) return;
      closed = true;
      // Invalidate async authorization before invoking host unsubscribe.
      try { bridge.dispose(); }
      finally {
        const release = unsubscribe;
        unsubscribe = null;
        release?.();
      }
    },
  };
}
