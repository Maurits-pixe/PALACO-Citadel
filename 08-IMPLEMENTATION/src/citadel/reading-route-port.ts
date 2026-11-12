/**
 * CITADEL-READING-ROUTE-PORT-001
 *
 * Host-wired DOM focus port for an already authorized Citadel reader route.
 * Host owns route navigation, authentication, access decisions and readiness.
 * No global DOM lookup, timers, polling, inferred URLs or event registration.
 */
import {
  focusTrustedChapter,
  focusTrustedRegion,
} from "./reading-dom";
import type { NavigationPort } from "./reading-navigation";
import type { ResumeTarget } from "./reading-routes";
import { isSafeSitePath } from "./reading-routes";

type Destination = Exclude<ResumeTarget, { kind: "none" }>;

export interface RenderedRouteHost {
  /** False on logout, changed session, superseding request or destroyed view. */
  isCurrent(): boolean;
  /** Must call site-owned access policy; it may depend on current session. */
  canOpen(target: Destination): Promise<boolean>;
  /**
   * Resolve only after the destination's authenticated route has rendered.
   * Must reject/return false if the session or route changed while navigating.
   * The provided guard becomes false after a superseding port request,
   * controller invalidation or lifecycle disposal.
   * Check it before committing any route side effects and after awaits.
   */
  navigateAndRender(path: string, isRequestCurrent: () => boolean): Promise<boolean>;
  /** The actual active route from the trusted router, not the bookmark. */
  activePath(): string | null;
  /**
   * Return the current, host-owned visible region container for the path.
   * Do not search document.body or accept a container from user input.
   */
  renderedContainer(path: string): HTMLElement | null;
}

/**
 * Create once per reader view. The NavigationPort protocol invokes
 * navigate(path) before focusChapter/focusRegion. No route is fabricated.
 *
 * This port never interprets a bookmark as evidence of authorization.
 * The real router must enforce its access controls independently.
 */
export function createRenderedRoutePort(host: RenderedRouteHost): NavigationPort {
  let destination: string | null = null;
  let navigationRevision = 0;

  const current = (): boolean => {
    try { return host.isCurrent() === true; } catch { return false; }
  };
  const currentContainer = (): HTMLElement | null => {
    if (!current() || destination === null) return null;
    try {
      if (host.activePath() !== destination) return null;
      const container = host.renderedContainer(destination);
      return container !== null && container.isConnected ? container : null;
    } catch {
      return null;
    }
  };

  return {
    isCurrent: current,
    canOpen: (target) => host.canOpen(target),
    async navigate(path: string, isRequestCurrent: () => boolean): Promise<boolean> {
      // Invalidate the last destination as well as any in-flight render.
      const requestRevision = ++navigationRevision;
      destination = null;
      const requestCurrent = (): boolean => {
        if (requestRevision !== navigationRevision || !current()) return false;
        try { return isRequestCurrent(); } catch { return false; }
      };
      if (!requestCurrent() || !isSafeSitePath(path)) return false;
      let rendered: boolean;
      try {
        rendered = await host.navigateAndRender(path, requestCurrent);
      } catch {
        return false;
      }
      if (!rendered || !requestCurrent()) return false;
      try {
        if (host.activePath() !== path) return false;
        const container = host.renderedContainer(path);
        if (container === null || !container.isConnected) return false;
      } catch {
        return false;
      }
      if (!requestCurrent()) return false;
      destination = path;
      return true;
    },
    async focusChapter(chapterId: string): Promise<boolean> {
      const container = currentContainer();
      return container === null ? false : focusTrustedChapter(container, chapterId);
    },
    async focusRegion(): Promise<boolean> {
      const container = currentContainer();
      return container === null ? false : focusTrustedRegion(container);
    },
  };
}
