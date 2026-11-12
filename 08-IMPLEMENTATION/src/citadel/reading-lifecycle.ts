/**
 * CITADEL-READING-LIFECYCLE-001
 *
 * Framework-neutral interface between Citadel's lifecycle events and the
 * reading controller. No DOM, network, browser storage, identity issuance
 * or authorization decisions are implemented here.
 *
 * The host MUST call the relevant functions at its own trusted lifecycle
 * boundaries. This adapter is not an event listener or security boundary.
 */
import {
  createReadingController,
  type ReadingController,
} from "./reading-controller";
import type { NavigationPort, NavigationResult } from "./reading-navigation";
import type { SiteRouteManifest } from "./reading-routes";
import type { StoragePort } from "./reading-state";
import {
  requestClearMemory,
  type ReadingActionResult,
} from "./reading-ui";

export type ReadingLifecycleChange =
  | "logout"
  | "session-changed"
  | "permissions-changed"
  | "route-replaced"
  | "reader-closed";

export interface ReadingLifecycle {
  /** Explicit user action only; the caller must not invoke on mount. */
  resumeFromClick(): Promise<NavigationResult>;
  /**
   * Invalidate in-flight resume BEFORE host applies the lifecycle change.
   * This does not cancel a route transition already started by the host.
   */
  beforeChange(change: ReadingLifecycleChange): void;
  /**
   * Clear only after UI confirmation, invalidating pending resume first.
   * Cannot guarantee success if browser storage is blocked.
   */
  clearReadingMemoryAfterConfirmation(confirmed: boolean): ReadingActionResult;
  /** End this view and prevent all further resume activity. */
  dispose(): void;
}

export function createReadingLifecycle(
  store: StoragePort,
  manifest: SiteRouteManifest,
  navigation: NavigationPort,
): ReadingLifecycle {
  const controller: ReadingController =
    createReadingController(store, manifest, navigation);
  let closed = false;

  const stale = (): NavigationResult => ({
    kind: "stale",
    message: "Het Leeskompas is gesloten of niet langer actueel.",
  });

  return {
    resumeFromClick(): Promise<NavigationResult> {
      return closed ? Promise.resolve(stale()) : controller.resume();
    },

    beforeChange(change: ReadingLifecycleChange): void {
      controller.invalidate();
      if (change === "reader-closed") closed = true;
    },

    clearReadingMemoryAfterConfirmation(confirmed: boolean): ReadingActionResult {
      if (!confirmed) return requestClearMemory(store, false);
      // Stop a pending resume before changing the stored bookmark.
      controller.invalidate();
      return requestClearMemory(store, true);
    },

    dispose(): void {
      closed = true;
      controller.dispose();
    },
  };
}
