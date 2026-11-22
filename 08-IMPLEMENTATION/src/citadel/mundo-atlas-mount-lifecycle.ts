/**
 * MUNDO-ATLAS-MOUNT-LIFECYCLE-012
 *
 * Private host-operated display lifecycle. The public demo must not import
 * this module or simulate PALACO ONE authorization. All real authorization
 * and source verification is delegated to the trusted host.
 */
import {
  prepareAuthorizedAtlasView,
  type AtlasView,
} from "./mundo-atlas-render-projection";
import type {
  AtlasLayerKind,
  AtlasSourceApproval,
  AtlasWorldId,
} from "./mundo-atlas-source-contract";

export interface MountedAtlasView {
  /** Must synchronously remove visible data and listeners; safe to repeat. */
  dispose(): void;
}

export interface AtlasViewHost extends AtlasSourceApproval {
  /**
   * Render an already admitted, immutable view. The host owns the protected
   * DOM and must render labels only through safe text / attributes.
   * No asynchronous callbacks; must return a scoped cleanup handle.
   */
  mount(view: AtlasView): MountedAtlasView;
}

export type AtlasMountResult =
  | { readonly kind: "mounted" }
  | { readonly kind: "denied" }
  | { readonly kind: "stale" }
  | { readonly kind: "mount-failed" };

export interface AtlasMountLifecycle {
  /** MUST be called BEFORE route, login or permission changes. */
  beforeContextChange(): void;
  /** Host calls ONLY after rendering and checking its protected route. */
  activate(
    input: unknown,
    worldId: AtlasWorldId,
    kind: AtlasLayerKind,
  ): Promise<AtlasMountResult>;
  /** Permanently stop the lifecycle and remove the current protected view. */
  dispose(): void;
  hasActiveView(): boolean;
}

export function createAtlasMountLifecycle(host: AtlasViewHost): AtlasMountLifecycle {
  let epoch = 0;
  let closed = false;
  let active: MountedAtlasView | null = null;
  let pending: { readonly epoch: number } | null = null;
  let mounting = false;

  const revoke = (): void => {
    ++epoch;
    pending = null;
    const previous = active;
    active = null;
    if (previous !== null) previous.dispose();
  };

  const contextMatches = (expected: string): boolean => {
    if (closed) return false;
    try { return host.readContextVersion() === expected; }
    catch { return false; }
  };

  return {
    beforeContextChange(): void {
      if (closed) return;
      try { revoke(); }
      catch (error) {
        closed = true;
        ++epoch;
        pending = null;
        throw error;
      }
    },
    async activate(input, worldId, kind): Promise<AtlasMountResult> {
      if (closed) return { kind: "stale" };
      if (active !== null || pending !== null || mounting) {
        return { kind: "mount-failed" };
      }
      // Reserve request BEFORE any user-owned callback to prevent synchronous
      // reentry or an epoch change during the initial context version read.
      const request = { epoch };
      pending = request;
      const stale = (): boolean =>
        closed || request.epoch !== epoch || pending !== request;
      try {
        let version: string | null = null;
        try { version = host.readContextVersion(); } catch { /* deny */ }
        if (stale()) return { kind: "stale" };
        if (typeof version !== "string" || version.length === 0) {
          return { kind: "denied" };
        }

        const result = await prepareAuthorizedAtlasView(input, worldId, kind, host);
        if (stale()) return { kind: "stale" };
        if (result.kind !== "ready") return { kind: result.kind };
        if (!contextMatches(version)) {
          return stale() ? { kind: "stale" } : { kind: "denied" };
        }
        if (stale()) return { kind: "stale" };

        let authorized = false;
        try { authorized = host.isStillAuthorized(worldId, kind) === true; }
        catch { /* deny */ }
        if (stale()) return { kind: "stale" };
        if (!authorized || !contextMatches(version)) {
          return stale() ? { kind: "stale" } : { kind: "denied" };
        }
        if (stale()) return { kind: "stale" };

        mounting = true;
        let created: MountedAtlasView | null = null;
        try {
          // The host callback may synchronously trigger beforeContextChange.
          created = host.mount(result.view);
          if (!created || typeof created.dispose !== "function") {
            return { kind: "mount-failed" };
          }

          let stillAuthorized = false;
          if (!stale()) {
            try { stillAuthorized = host.isStillAuthorized(worldId, kind) === true; }
            catch { /* deny */ }
          }
          const stillCurrent = !stale() && contextMatches(version);
          if (stale() || !stillAuthorized || !stillCurrent) {
            try { created.dispose(); } catch { /* reject unsafe mount */ }
            return stale() ? { kind: "stale" } : { kind: "denied" };
          }

          active = created;
          return { kind: "mounted" };
        } catch {
          try { created?.dispose(); } catch { /* reject unsafe mount */ }
          return stale() ? { kind: "stale" } : { kind: "mount-failed" };
        } finally {
          mounting = false;
        }
      } finally {
        if (pending === request) pending = null;
      }
    },
    dispose(): void {
      if (closed) return;
      closed = true;
      revoke();
    },
    hasActiveView(): boolean {
      return !closed && active !== null;
    },
  };
}
