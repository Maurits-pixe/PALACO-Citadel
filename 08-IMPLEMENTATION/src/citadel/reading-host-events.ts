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
  let subscribing = true;
  let eventDuringSubscription = false;

  const onBeforeChange = (change: ReadingLifecycleChange): void => {
    if (closed) return;
    if (subscribing) eventDuringSubscription = true;
    // Invalid event types also revoke this view's previous context.
    bridge.beforeHostChange(CHANGES.includes(change) ? change : "session-changed");
  };

  try {
    const release = source.subscribeBeforeChange(onBeforeChange);
    if (typeof release !== "function") throw new Error("CITADEL_READING_INVALID_UNSUBSCRIBE");
    unsubscribe = release;
    subscribing = false;
    if (eventDuringSubscription) {
      // Subscription raced a trusted context change: a new host check and
      // fresh registration are mandatory, never silently activate this view.
      closed = true;
      bridge.dispose();
      unsubscribe = null;
      release();
      throw new Error("CITADEL_READING_SUBSCRIPTION_CONTEXT_CHANGED");
    }
  } catch (error) {
    closed = true;
    subscribing = false;
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
