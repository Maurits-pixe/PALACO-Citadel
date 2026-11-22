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
  /** Host-generated, non-reused opaque session+route+permission epoch. */
  readProtectedContextVersion(): string | null;
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
      typeof host.readProtectedContextVersion !== "function" ||
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
          // Read route and a strictly new host context version AFTER the
          // protected route commit. A matching world ID is insufficient:
          // session/permissions could have changed to a different identity.
          let routeVersion: string | null = null;
          try {
            if (host.readProtectedRouteWorldId() !== worldId) return null;
            routeVersion = host.readProtectedContextVersion();
          } catch { return null; }
          if (closed || generation !== request ||
              !routeVersion || !/^[a-zA-Z0-9._:-]{1,128}$/.test(routeVersion)) return null;

          let fresh: AtlasFreshWorld | null = null;
          try { fresh = await host.createFreshWorld(worldId, kind); }
          catch { return null; }

          // A generation revoked while the factory was pending is handled by
          // WorldTransition's recovery supervisor (including late disposal).
          if (closed || generation !== request) return fresh;

          let sameContext = false;
          try {
            sameContext =
              host.readProtectedRouteWorldId() === worldId &&
              host.readProtectedContextVersion() === routeVersion;
          } catch { /* fail closed */ }
          if (!sameContext || closed || generation !== request) {
            // Here the bridge returns null: the transition cannot see and
            // dispose this already-created connection.
            try { fresh?.connection.dispose(); } catch { /* no reuse */ }
            return null;
          }
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
