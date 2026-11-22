/**
 * MUNDO-ATLAS-PRIVATE-INTEGRATION-028
 *
 * Single composition root for an actual protected Citadel host.
 * It is NOT an authentication implementation, router, token reader,
 * PALACO ONE connector, or part of the public MUNDO demonstration.
 */
import {
  createAtlasNavigationBridge,
  type AtlasNavigationHost,
} from "./mundo-atlas-navigation-bridge";
import {
  createAtlasSessionHandoff,
  type AtlasSessionHandoffHost,
  type AtlasSessionHandoffState,
} from "./mundo-atlas-session-handoff";
import {
  connectAtlasSessionRevocation,
  type AtlasSessionRevocationHost,
} from "./mundo-atlas-session-revocation";
import type { AtlasLayerKind, AtlasWorldId } from "./mundo-atlas-source-contract";
import type { AtlasWorldSwitchResult } from "./mundo-atlas-world-transition";

/** Real host supplies every callback; no guessed PALACO ONE or route API. */
export interface AtlasPrivateIntegrationHost
  extends AtlasNavigationHost, AtlasSessionHandoffHost, AtlasSessionRevocationHost {}

export interface AtlasPrivateIntegration {
  /** Explicit owner/host action: never automatically replay an old source. */
  openWorld(worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasWorldSwitchResult>;
  /** Synchronous safety barrier for other protected host changes. */
  beforeContextChange(): void;
  /** Observability only. Neither state nor status grants access. */
  readState(): AtlasSessionHandoffState;
  isClosed(): boolean;
  /** Permanently release event subscription and private view. */
  dispose(): void;
}

/**
 * Integrate in this order: protected navigation -> session handoff ->
 * before-change subscription. A failure to subscribe disposes all prior
 * stages, never leaving a partially active private Atlas integration.
 */
export function connectAtlasPrivateIntegration(
  host: AtlasPrivateIntegrationHost,
): AtlasPrivateIntegration {
  if (!host || typeof host !== "object") {
    throw new Error("MUNDO_ATLAS_PRIVATE_HOST_REQUIRED");
  }

  const navigation = createAtlasNavigationBridge(host);
  let handoff: ReturnType<typeof createAtlasSessionHandoff>;
  try {
    handoff = createAtlasSessionHandoff(host, navigation);
  } catch (error) {
    try { navigation.dispose(); } catch { /* do not restore prior access */ }
    throw error;
  }

  let revocation: ReturnType<typeof connectAtlasSessionRevocation>;
  try {
    revocation = connectAtlasSessionRevocation(host, handoff);
  } catch (error) {
    // The subscription adapter also tries cleanup on its error path.
    // A second disposal must be idempotent, including host subscribers.
    try { handoff.dispose(); } catch { /* preserve original failure */ }
    throw error;
  }

  let disposed = false;
  const invalid = (): boolean => disposed || revocation.isClosed();
  return {
    async openWorld(worldId, kind): Promise<AtlasWorldSwitchResult> {
      if (invalid()) return "denied";
      try {
        const result = await handoff.handoff(worldId, kind);
        return invalid() ? "stale" : result;
      } catch {
        // A throwing host callback cannot be trusted for another operation.
        try { revocation.dispose(); } catch { /* fail closed */ }
        return "denied";
      }
    },
    beforeContextChange(): void {
      if (invalid()) return;
      try { handoff.beforeSessionChange(); }
      catch { try { revocation.dispose(); } catch { /* fail closed */ } }
    },
    readState(): AtlasSessionHandoffState {
      return invalid() ? "closed" : handoff.readState();
    },
    isClosed(): boolean { return invalid(); },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      revocation.dispose();
    },
  };
}
