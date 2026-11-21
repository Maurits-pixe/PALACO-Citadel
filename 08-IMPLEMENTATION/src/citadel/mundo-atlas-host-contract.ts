/**
 * MUNDO-ATLAS-HOST-CONTRACT-014
 *
 * Explicit integration point for Citadel's REAL protected route/session.
 * This file does not discover PALACO ONE, register global listeners,
 * grant permissions, or expose private data on the public Atlas.
 */
import {
  createAtlasMountLifecycle,
  type AtlasMountResult,
  type AtlasViewHost,
} from "./mundo-atlas-mount-lifecycle";
import type { AtlasLayerKind, AtlasWorldId } from "./mundo-atlas-source-contract";

export type AtlasContextChange =
  | "logout" | "session-changed" | "permissions-changed"
  | "route-replaced" | "atlas-closed";

export interface AtlasHostContract extends AtlasViewHost {
  /**
   * Register an event emitted synchronously BEFORE any relevant host change.
   * Registration MUST be atomic: on throw the host removes any newly added
   * listener before propagating the error.
   */
  subscribeBeforeChange(handler: (change: AtlasContextChange) => void): () => void;
}

export interface ConnectedAtlasHost {
  /** Explicit host action only after its protected route has rendered. */
  activate(input: unknown, worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasMountResult>;
  /** For host transitions not automatically reported by the subscription. */
  beforeContextChange(change: AtlasContextChange): void;
  /** Unsubscribe and irreversibly revoke the current view. */
  dispose(): void;
  hasActiveView(): boolean;
}

const CHANGES: readonly AtlasContextChange[] = [
  "logout", "session-changed", "permissions-changed",
  "route-replaced", "atlas-closed",
];

/**
 * A successfully constructed connection is NOT proof that host callbacks
 * authenticate, authorize, verify sources or revoke data correctly.
 */
export function connectAtlasHostContract(contract: AtlasHostContract): ConnectedAtlasHost {
  if (contract === null || typeof contract !== "object" ||
      typeof contract.subscribeBeforeChange !== "function" ||
      typeof contract.authorizeAndVerify !== "function" ||
      typeof contract.isStillAuthorized !== "function" ||
      typeof contract.readContextVersion !== "function" ||
      typeof contract.mount !== "function") {
    throw new Error("MUNDO_ATLAS_HOST_CONTRACT_INCOMPLETE");
  }

  // Class-backed host methods must keep their original receiver.
  const lifecycle = createAtlasMountLifecycle({
    authorizeAndVerify: (envelope) => contract.authorizeAndVerify(envelope),
    isStillAuthorized: (world, kind) => contract.isStillAuthorized(world, kind),
    readContextVersion: () => contract.readContextVersion(),
    mount: (view) => contract.mount(view),
  });

  let closed = false;
  let subscribing = true;
  let changedDuringRegistration = false;
  let unsubscribe: (() => void) | null = null;

  const close = (): void => {
    if (closed) return;
    closed = true;
    const release = unsubscribe;
    unsubscribe = null;
    try {
      lifecycle.dispose();
    } finally {
      release?.();
    }
  };

  const beforeChange = (change: AtlasContextChange): void => {
    if (closed) return;
    if (subscribing) changedDuringRegistration = true;
    // Unknown event names are treated as an unsafe context transition.
    // Do not assume the prior authorization remains valid.
    const normalized: AtlasContextChange = CHANGES.includes(change)
      ? change : "session-changed";
    void normalized;
    try {
      lifecycle.beforeContextChange();
    } catch {
      // If old data could not be torn down, never accept new requests.
      if (subscribing) {
        changedDuringRegistration = true;
        try { lifecycle.dispose(); } catch { /* host cleanup failure */ }
      } else {
        try { close(); } catch { /* host cleanup failure */ }
      }
    }
  };

  try {
    // The host must not emit before-change events while registering.
    const release = contract.subscribeBeforeChange(beforeChange);
    if (typeof release !== "function") {
      throw new Error("MUNDO_ATLAS_INVALID_UNSUBSCRIBE");
    }
    unsubscribe = release;
    subscribing = false;
    if (changedDuringRegistration) {
      throw new Error("MUNDO_ATLAS_SUBSCRIPTION_CONTEXT_CHANGED");
    }
  } catch (error) {
    subscribing = false;
    try { close(); } catch { /* preserve the registration failure */ }
    throw error;
  }

  return {
    activate(input, worldId, kind): Promise<AtlasMountResult> {
      return closed
        ? Promise.resolve({ kind: "stale" })
        : lifecycle.activate(input, worldId, kind);
    },
    beforeContextChange(change): void { beforeChange(change); },
    dispose(): void { close(); },
    hasActiveView(): boolean { return !closed && lifecycle.hasActiveView(); },
  };
}
