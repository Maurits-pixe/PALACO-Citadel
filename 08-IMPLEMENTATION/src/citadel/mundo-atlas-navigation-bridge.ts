/**
 * MUNDO-ATLAS-NAVIGATION-BRIDGE-023
 *
 * Explicit private Citadel route-to-world handoff. This module NEVER
 * discovers/changes the browser URL, imports public data or assumes a
 * PALACO ONE router API. The actual protected Citadel host owns all routes.
 */
import {
  createAtlasWorldTransition,
  type AtlasFreshWorld,
  type AtlasWorldSwitchResult,
  type AtlasWorldTransition,
} from "./mundo-atlas-world-transition";
import type { AtlasLayerKind, AtlasWorldId } from "./mundo-atlas-source-contract";

export interface AtlasNavigationHost {
  /**
   * Synchronously commit the protected route ONLY after the prior world has
   * been revoked. Must fail closed; no timer or Promise is supported here.
   * The real router must deliver its own BEFORE-change events synchronously.
   */
  commitProtectedWorldRoute(worldId: AtlasWorldId): boolean;
  /** Read the current authenticated private route; null on any uncertainty. */
  readProtectedRouteWorldId(): AtlasWorldId | null;
  /**
   * Resolve a NEW host connection and immutable source for the requested
   * current route. No cached envelope, implicit retry or public fallback.
   */
  createFreshWorld(worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasFreshWorld | null>;
}

export interface AtlasNavigationBridge {
  navigate(worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasWorldSwitchResult>;
  /** Host calls before any unrelated route, permission or session change. */
  beforeContextChange(): void;
  dispose(): void;
}

/**
 * A synchronous guarded route step is nested INSIDE switchWorld's fresh
 * callback: old Atlas data are disposed BEFORE the route can be committed.
 * No admission happens until the host confirms the requested route is current.
 */
export function createAtlasNavigationBridge(
  host: AtlasNavigationHost,
  transition: AtlasWorldTransition = createAtlasWorldTransition(),
): AtlasNavigationBridge {
  if (!host || typeof host.commitProtectedWorldRoute !== "function" ||
      typeof host.readProtectedRouteWorldId !== "function" ||
      typeof host.createFreshWorld !== "function") {
    throw new Error("MUNDO_ATLAS_NAVIGATION_HOST_INCOMPLETE");
  }

  let closed = false;
  let generation = 0;
  let pending = false;
  return {
    async navigate(worldId, kind): Promise<AtlasWorldSwitchResult> {
      if (closed || pending) return "denied";
      const request = ++generation;
      pending = true;
      try {
        const outcome = await transition.switchWorld(worldId, kind, async () => {
          // This callback begins only AFTER the old view was revoked.
          if (closed || generation !== request) return null;
          let committed = false;
          try { committed = host.commitProtectedWorldRoute(worldId) === true; }
          catch { return null; }
          if (!committed || closed || generation !== request) return null;
          try {
            if (host.readProtectedRouteWorldId() !== worldId) return null;
          } catch { return null; }

          let fresh: AtlasFreshWorld | null = null;
          try { fresh = await host.createFreshWorld(worldId, kind); }
          catch { return null; }

          // This remains a host responsibility: the returned source must
          // belong to this exact world, route, context and access policy.
          if (closed || generation !== request) {
            // The WorldTransition supervisor owns the late connection's
            // disposal after invalidation; do not dispose it twice here.
            return fresh;
          }
          try {
            if (host.readProtectedRouteWorldId() !== worldId) return null;
          } catch { return null; }
          return fresh;
        });
        return closed || generation !== request ? "stale" : outcome;
      } finally {
        pending = false;
      }
    },
    beforeContextChange(): void {
      if (closed) return;
      ++generation;
      transition.beforeContextChange();
    },
    dispose(): void {
      if (closed) return;
      closed = true;
      ++generation;
      transition.dispose();
    },
  };
}
