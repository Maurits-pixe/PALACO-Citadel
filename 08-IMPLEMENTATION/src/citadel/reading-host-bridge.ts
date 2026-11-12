/**
 * CITADEL-READING-HOST-BRIDGE-001
 *
 * Explicit integration boundary for a host's REAL session and route events.
 * No PALACO ONE API assumptions, global listeners, identity claims or access
 * grants. The host must supply its own authenticated authorization check.
 */
import {
  createReadingMountCoordinator,
  type ReadingMountCoordinator,
} from "./reading-mount-coordinator";
import type { ReadingLifecycleChange } from "./reading-lifecycle";
import type { ReadingMountOptions } from "./reading-mount";

export type ReadingBridgeResult =
  | { readonly kind: "mounted" }
  | { readonly kind: "denied" }
  | { readonly kind: "stale" }
  | { readonly kind: "mount-failed" };

export interface ReadingHostBridge {
  /** Invoke synchronously BEFORE changing the real route or session. */
  beforeHostChange(change: ReadingLifecycleChange): void;
  /**
   * Call only after actual route rendering. The host must check its current
   * authenticated identity, permissions and view on every invocation.
   * A false result must not return any reader configuration.
   */
  activate(
    authorizeAndResolve: () => Promise<ReadingMountOptions | null>,
  ): Promise<ReadingBridgeResult>;
  /** Permanently destroy this bridge; never revive an old reader. */
  dispose(): void;
}

/**
 * The bridge does not verify host claims: it prevents late asynchronous
 * authorizations from mounting a reader in a newer context.
 */
export function createReadingHostBridge(
  coordinator: ReadingMountCoordinator = createReadingMountCoordinator(),
): ReadingHostBridge {
  let epoch = 0;
  let disposed = false;
  let activating = false;

  return {
    beforeHostChange(change: ReadingLifecycleChange): void {
      if (disposed) return;
      ++epoch;
      try {
        coordinator.transition(change);
      } catch (error) {
        // A failed teardown leaves the host context uncertain. Revoke this
        // bridge permanently instead of allowing a later activation.
        disposed = true;
        ++epoch;
        try { coordinator.dispose(); } catch { /* preserve transition error */ }
        throw error;
      }
    },
    async activate(
      authorizeAndResolve: () => Promise<ReadingMountOptions | null>,
    ): Promise<ReadingBridgeResult> {
      if (disposed) return { kind: "stale" };
      if (activating || coordinator.hasActiveMount()) {
        return { kind: "mount-failed" };
      }

      const requestedEpoch = epoch;
      activating = true;
      try {
        let options: ReadingMountOptions | null;
        try {
          options = await authorizeAndResolve();
        } catch {
          return requestedEpoch !== epoch || disposed
            ? { kind: "stale" }
            : { kind: "denied" };
        }

        if (disposed || requestedEpoch !== epoch) return { kind: "stale" };
        if (options === null) return { kind: "denied" };

        // The callback may synchronously trigger a host transition while
        // mount's presentation initializes. The coordinator catches it.
        try {
          coordinator.mountAuthorized(options);
          if (disposed || requestedEpoch !== epoch) {
            coordinator.transition("session-changed");
            return { kind: "stale" };
          }
          return { kind: "mounted" };
        } catch {
          return disposed || requestedEpoch !== epoch
            ? { kind: "stale" }
            : { kind: "mount-failed" };
        }
      } finally {
        activating = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++epoch;
      coordinator.dispose();
    },
  };
}
