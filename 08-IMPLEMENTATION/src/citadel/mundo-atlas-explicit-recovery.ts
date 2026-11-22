/**
 * MUNDO-ATLAS-EXPLICIT-RECOVERY-019
 *
 * Host-controlled recovery after an Atlas connection becomes invalid.
 * Does not fetch sources, cache identity or data, discover routes, or retry.
 * A "fresh" connection must be constructed by the real protected Citadel host.
 */
import type { ConnectedAtlasHost } from "./mundo-atlas-host-contract";
import type { AtlasWorldId, AtlasLayerKind } from "./mundo-atlas-source-contract";
import type { AtlasMountResult } from "./mundo-atlas-mount-lifecycle";

export interface AtlasRecoverySupervisor {
  /**
   * Explicit host decision to invalidate pending requests and revoke the
   * current connection BEFORE host route/session/permission mutations.
   */
  invalidate(): void;
  /**
   * Host supplies a NEW verified integration. No cached source or permission
   * is transferred. One recovery operation at a time.
   */
  reconnect(createFresh: () => Promise<ConnectedAtlasHost>): Promise<"connected" | "stale" | "denied">;
  /**
   * Accept a NEW envelope from the current host only. Denied/stale/mount
   * failures never auto-retry, reconnect, or replay an earlier payload.
   */
  activate(input: unknown, worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasMountResult>;
  hasConnection(): boolean;
  dispose(): void;
}

export function createAtlasRecoverySupervisor(): AtlasRecoverySupervisor {
  let epoch = 0;
  let closed = false;
  let quarantined = false;
  let connection: ConnectedAtlasHost | null = null;
  let recovering = false;

  /** If host teardown fails, permanently disable THIS supervisor instance. */
  const release = (value: ConnectedAtlasHost | null): boolean => {
    if (value === null) return true;
    try { value.dispose(); return true; }
    catch { quarantined = true; return false; }
  };

  const invalidate = (): void => {
    if (closed) return;
    ++epoch;
    const previous = connection;
    connection = null;
    release(previous);
  };

  return {
    invalidate,
    async reconnect(createFresh): Promise<"connected" | "stale" | "denied"> {
      if (closed || quarantined || recovering || connection !== null ||
          typeof createFresh !== "function") return "denied";
      const requestEpoch = epoch;
      recovering = true;
      let created: ConnectedAtlasHost | null = null;
      try {
        // The factory MUST create a fresh protected host connection only after
        // independent authentication, authorization and context transition.
        created = await createFresh();
        if (!created || typeof created.activate !== "function" ||
            typeof created.dispose !== "function" ||
            typeof created.hasActiveView !== "function") {
          if (created && typeof created.dispose === "function") release(created);
          return "denied";
        }
        if (closed || quarantined || epoch !== requestEpoch) {
          release(created);
          return "stale";
        }
        connection = created;
        return "connected";
      } catch {
        if (created !== null) release(created);
        return closed || epoch !== requestEpoch ? "stale" : "denied";
      } finally {
        recovering = false;
      }
    },
    async activate(input, worldId, kind): Promise<AtlasMountResult> {
      const current = connection;
      if (closed || quarantined || recovering || current === null)
        return { kind: "denied" };
      const requestEpoch = epoch;
      let result: AtlasMountResult;
      try { result = await current.activate(input, worldId, kind); }
      catch {
        // An exception is never safe to retry under the old host context.
        if (connection === current) invalidate();
        return { kind: "denied" };
      }
      if (closed || quarantined || epoch !== requestEpoch || connection !== current)
        return { kind: "stale" };
      // No automatic recovery of unsuccessful requests.
      return result;
    },
    hasConnection(): boolean {
      return !closed && !quarantined && connection !== null;
    },
    dispose(): void {
      if (closed) return;
      invalidate();
      closed = true;
    },
  };
}
