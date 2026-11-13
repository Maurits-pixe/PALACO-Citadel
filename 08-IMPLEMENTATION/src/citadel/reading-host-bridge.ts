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
   * Revalidate the CURRENT host context immediately before mounting. The
   * synchronous check must independently confirm route, session and access.\n   * It is repeated after mounting to reject synchronous host-side changes.
   */
  activate(
    authorizeAndResolve: () => Promise<ReadingMountOptions | null>,
    isStillAuthorized: () => boolean,
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
  let activeRequest: { readonly epoch: number } | null = null;

  return {
    beforeHostChange(change: ReadingLifecycleChange): void {
      if (disposed) return;
      ++epoch;
      // A pending authorization belongs to the old context. Let a new
      // context start its own request without waiting for the old promise.
      activeRequest = null;
      try {
        coordinator.transition(change);
      } catch (error) {
        // A failed teardown leaves the host context uncertain. Revoke this
        // bridge permanently instead of allowing a later activation.
        disposed = true;
        ++epoch;
        activeRequest = null;
        try { coordinator.dispose(); } catch { /* preserve transition error */ }
        throw error;
      }
    },
    async activate(
      authorizeAndResolve: () => Promise<ReadingMountOptions | null>,
      isStillAuthorized: () => boolean,
    ): Promise<ReadingBridgeResult> {
      if (disposed) return { kind: "stale" };
      if (activeRequest !== null || coordinator.hasActiveMount()) {
        return { kind: "mount-failed" };
      }

      const request = { epoch };
      activeRequest = request;
      const isStale = (): boolean =>
        disposed || epoch !== request.epoch || activeRequest !== request;
      try {
        let options: ReadingMountOptions | null;
        try {
          options = await authorizeAndResolve();
        } catch {
          return isStale()
            ? { kind: "stale" }
            : { kind: "denied" };
        }

        if (isStale()) return { kind: "stale" };
        if (options === null) return { kind: "denied" };

        // Async authorization can outlive its session. Ask the trusted host
        // again, synchronously, at the final handoff to the mount.
        let authorized = false;
        try {
          authorized = isStillAuthorized() === true;
        } catch {
          authorized = false;
        }
        if (isStale()) return { kind: "stale" };
        if (!authorized) return { kind: "denied" };

        // The callback may synchronously trigger a host transition while
        // mount's presentation initializes. The coordinator catches it.
        try {
          const mounted = coordinator.mountAuthorized(options);
          // Mounting can synchronously invoke host UI hooks. Such hooks may
          // alter permissions without reporting a before-change event.
          // Recheck actual authority after the DOM/presenter is installed.
          let stillAuthorized = false;
          if (!isStale()) {
            try {
              stillAuthorized = isStillAuthorized() === true;
            } catch {
              stillAuthorized = false;
            }
          }
          if (isStale() || !stillAuthorized) {
            // This scoped handle cannot close a newer authorized mount.
            // Deny the just-created view before reporting success.
            try { mounted.dispose(); } catch { /* already invalidated */ }
            return isStale() ? { kind: "stale" } : { kind: "denied" };
          }
          return { kind: "mounted" };
        } catch {
          return isStale()
            ? { kind: "stale" }
            : { kind: "mount-failed" };
        }
      } finally {
        if (activeRequest === request) activeRequest = null;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++epoch;
      activeRequest = null;
      coordinator.dispose();
    },
  };
}
