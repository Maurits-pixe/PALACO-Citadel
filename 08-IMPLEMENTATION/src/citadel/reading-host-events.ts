/**
 * CITADEL-READING-HOST-EVENTS-003
 *
 * An explicit synchronous BEFORE-change subscription provided by Citadel.
 * No inferred PALACO ONE event API or automatic authentication.
 */
import { createReadingHostBridge, type ReadingBridgeResult } from "./reading-host-bridge";
import type { ReadingLifecycleChange } from "./reading-lifecycle";
import type { ReadingMountOptions } from "./reading-mount";

const CHANGES: readonly ReadingLifecycleChange[] = [
  "logout", "session-changed", "permissions-changed", "route-replaced", "reader-closed",
];

export interface ReadingBeforeChangeSource {
  /**
   * Emit before the host commits route/session/permission changes.
   * Registration must be atomic: if this method throws, the source itself
   * must remove any listener it installed before throwing.
   */
  subscribeBeforeChange(handler: (change: ReadingLifecycleChange) => void): () => void;
}

export interface ConnectedReadingHost {
  activate(authorizeAndResolve: () => Promise<ReadingMountOptions | null>): Promise<ReadingBridgeResult>;
  beforeHostChange(change: ReadingLifecycleChange): void;
  dispose(): void;
}

export function connectReadingHostEvents(source: ReadingBeforeChangeSource): ConnectedReadingHost {
  const bridge = createReadingHostBridge();
  let closed = false;
  let subscribing = true;
  let eventDuringSubscription = false;
  let unsubscribe: (() => void) | null = null;

  // Release exactly once even if the host calls dispose recursively.
  // Cleanup callbacks are untrusted: never restore the old reader on errors.
  const close = (): void => {
    if (closed) return;
    closed = true;
    const release = unsubscribe;
    unsubscribe = null;
    try {
      bridge.dispose();
    } finally {
      release?.();
    }
  };

  const onBeforeChange = (change: ReadingLifecycleChange): void => {
    if (closed) return;
    if (subscribing) eventDuringSubscription = true;
    const safeChange = CHANGES.includes(change) ? change : "session-changed";
    try {
      bridge.beforeHostChange(safeChange);
    } catch {
      // If the host's transition handler fails, permanently revoke this
      // bridge, rather than allowing a potentially stale session to resume.
      // An event during registration is cleaned up after subscribe returns.
      if (subscribing) {
        eventDuringSubscription = true;
        try { bridge.dispose(); } catch { /* already invalidated */ }
      } else {
        try { close(); } catch { /* already invalidated */ }
      }
    }
  };

  let release: (() => void) | null = null;
  try {
    release = source.subscribeBeforeChange(onBeforeChange);
    if (typeof release !== "function") {
      throw new Error("CITADEL_READING_INVALID_UNSUBSCRIBE");
    }
    unsubscribe = release;
    subscribing = false;
    if (eventDuringSubscription) {
      // One registration-time event means the captured context was unstable.
      throw new Error("CITADEL_READING_SUBSCRIPTION_CONTEXT_CHANGED");
    }
  } catch (error) {
    subscribing = false;
    // Do not mask the registration fault if teardown itself fails.
    try { close(); } catch { /* cleanup best effort; source owns atomicity */ }
    throw error;
  }

  return {
    activate(callback): Promise<ReadingBridgeResult> {
      return closed
        ? Promise.resolve({ kind: "stale" })
        : bridge.activate(callback);
    },
    beforeHostChange(change): void {
      onBeforeChange(change);
    },
    dispose(): void {
      close();
    },
  };
}
