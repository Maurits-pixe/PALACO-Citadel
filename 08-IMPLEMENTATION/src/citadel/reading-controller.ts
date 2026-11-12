/**
 * CITADEL-READING-CONTROLLER-001
 * Frontend-facing, framework-neutral connector between per-view cancellation
 * and guarded resume navigation. It does not implement authentication,
 * browser routing, rendering or a Sites deployment.
 */
import { createResumeRequestCoordinator } from "./reading-epoch";
import {
  openSavedReadingPlace,
  type NavigationPort,
  type NavigationResult,
} from "./reading-navigation";
import type { SiteRouteManifest } from "./reading-routes";
import type { StoragePort } from "./reading-state";

export interface ReadingController {
  /** Invoke only from a deliberate user click/tap on "Verder lezen". */
  resume(): Promise<NavigationResult>;
  /** Invalidate on logout, session/route change, privacy wipe, or close. */
  invalidate(): void;
  /** End this view's lifecycle; further resume calls return stale. */
  dispose(): void;
}

/**
 * The host must bind port.isCurrent() to its real session and route epoch.
 * Every new resume call invalidates previous calls before awaiting anything.
 * This guard is not a replacement for a route guard or server authorization.
 */
export function createReadingController(
  store: StoragePort,
  manifest: SiteRouteManifest,
  port: NavigationPort,
): ReadingController {
  const coordinator = createResumeRequestCoordinator();
  let disposed = false;

  const staleResult = (): NavigationResult => ({
    kind: "stale",
    message: "De lezer of sessie is gewijzigd; hervatten is afgebroken.",
  });

  return {
    async resume(): Promise<NavigationResult> {
      if (disposed) return staleResult();
      const request = coordinator.begin();
      const scopedPort: NavigationPort = {
        isCurrent: () => !disposed && request.isCurrent() && port.isCurrent(),
        canOpen: (target) => port.canOpen(target),
        navigate: (path) => port.navigate(path),
        focusChapter: (chapterId) => port.focusChapter(chapterId),
        focusRegion: () => port.focusRegion(),
      };

      try {
        const result = await openSavedReadingPlace(store, manifest, scopedPort);
        // A late response from an earlier request must not be shown as success.
        if (disposed || !request.isCurrent()) return staleResult();
        try {
          if (!port.isCurrent()) return staleResult();
        } catch {
          return staleResult();
        }
        return result;
      } catch {
        if (disposed || !request.isCurrent()) return staleResult();
        return {
          kind: "navigation-failed",
          message: "Het hervatten is onverwacht onderbroken.",
        };
      }
    },
    invalidate(): void {
      coordinator.invalidateAll();
    },
    dispose(): void {
      disposed = true;
      coordinator.invalidateAll();
    },
  };
}
