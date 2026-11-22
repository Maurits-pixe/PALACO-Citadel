/**
 * MUNDO-ATLAS-WORLD-TRANSITION-022
 *
 * Host-invoked private world switch. Revokes prior Atlas before requesting a
 * new host connection or source. No public site import, network, login,
 * route changes, source caching or automated retries.
 */
import {
  createAtlasRecoverySupervisor,
  type AtlasRecoverySupervisor,
} from "./mundo-atlas-explicit-recovery";
import type { ConnectedAtlasHost } from "./mundo-atlas-host-contract";
import type { AtlasWorldId, AtlasLayerKind } from "./mundo-atlas-source-contract";

export type AtlasWorldSwitchResult =
  | "mounted" | "denied" | "stale" | "mount-failed";

export interface AtlasFreshWorld {
  /** A NEW host connection, independently authenticated and authorized. */
  readonly connection: ConnectedAtlasHost;
  /** NEW immutable source envelope bound to the requested world and kind. */
  readonly envelope: unknown;
}

export interface AtlasWorldTransition {
  /**
   * Host MUST call before changing its actual route/session/world context.
   * Existing protected view and all older pending requests are invalidated
   * synchronously; fresh admission then happens only by an explicit callback.
   */
  switchWorld(
    worldId: AtlasWorldId,
    kind: AtlasLayerKind,
    createFresh: () => Promise<AtlasFreshWorld | null>,
  ): Promise<AtlasWorldSwitchResult>;
  /** Synchronous global revoke before any external host context change. */
  beforeContextChange(): void;
  dispose(): void;
}

export function createAtlasWorldTransition(
  supervisor: AtlasRecoverySupervisor = createAtlasRecoverySupervisor(),
): AtlasWorldTransition {
  let closed = false;
  let generation = 0;
  let switching = false;
  const validWorld = (value: unknown): value is AtlasWorldId =>
    typeof value === "string" && /^W-000[1-7]$/.test(value);
  const validKind = (value: unknown): value is AtlasLayerKind =>
    value === "geography" || value === "evidence";

  const revoke = (): void => {
    ++generation;
    supervisor.invalidate();
  };

  return {
    async switchWorld(worldId, kind, createFresh): Promise<AtlasWorldSwitchResult> {
      if (closed || switching || !validWorld(worldId) || !validKind(kind) ||
          typeof createFresh !== "function") return "denied";
      // Reserve BEFORE any host code. No competing switch can run or revoke
      // the first request implicitly. The host can explicitly revoke it.
      switching = true;
      const request = ++generation;
      let fresh: AtlasFreshWorld | null = null;
      try {
        // Synchronous revocation ALWAYS precedes the new async factory.
        supervisor.invalidate();
        if (closed || generation !== request) return "stale";
        const connected = await supervisor.reconnect(async () => {
          fresh = await createFresh();
          if (!fresh || !fresh.connection ||
              typeof fresh.connection.dispose !== "function") {
            throw new Error("MUNDO_ATLAS_FRESH_WORLD_UNAVAILABLE");
          }
          return fresh.connection;
        });
        if (closed || generation !== request) return "stale";
        if (connected !== "connected") return connected;
        if (!fresh) {
          supervisor.invalidate();
          return "denied";
        }
        const result = await supervisor.activate(fresh.envelope, worldId, kind);
        if (closed || generation !== request) return "stale";
        if (result.kind !== "mounted") {
          // No fallback to a previous world on source denial.
          supervisor.invalidate();
        }
        return result.kind;
      } catch {
        if (!closed && generation === request) supervisor.invalidate();
        return closed || generation !== request ? "stale" : "denied";
      } finally {
        // The old promise must not change a newer context. No source retained.
        if (generation === request) switching = false;
        else switching = false; // exclusive single-flight token still belongs here
        fresh = null;
      }
    },
    beforeContextChange(): void { if (!closed) revoke(); },
    dispose(): void {
      if (closed) return;
      closed = true;
      ++generation;
      supervisor.dispose();
    },
  };
}
