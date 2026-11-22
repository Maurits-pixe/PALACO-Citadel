/**
 * MUNDO-ATLAS-SESSION-REVOCATION-027
 *
 * Private, host-driven synchronous before-change event bridge for an already
 * constructed SessionHandoff. NO polling, timers, tokens, browser event
 * guessing, or public Render imports. Requires a real protected host.
 */
import type { AtlasSessionHandoff } from "./mundo-atlas-session-handoff";

export type AtlasSessionRevocationReason =
  | "logout" | "session-expired" | "permissions-changed"
  | "identity-changed" | "atlas-closed";

export interface AtlasSessionRevocationHost {
  /**
   * Subscribe to a synchronous PRE-transition host notification.
   * Registration MUST be atomic: if it throws, the host must remove any
   * already registered callback before propagating the exception.
   * Unsubscribe MUST be synchronous and idempotent.
   */
  subscribeBeforeSessionChange(
    handler: (reason: AtlasSessionRevocationReason) => void,
  ): () => void;
}

export interface AtlasSessionRevocationBridge {
  /** Terminal stop, including removal of host listener and Atlas view. */
  dispose(): void;
  /** Observational flag only: does not authorize content. */
  isClosed(): boolean;
}

/**
 * Fail closed if registration, a malformed event, or teardown fails.
 * On a recognized event: invoke beforeSessionChange BEFORE host context
 * mutation, invalidating all pending source requests and mounted views.
 * The host must not mutate the protected session until the listener returns.
 */
export function connectAtlasSessionRevocation(
  host: AtlasSessionRevocationHost,
  handoff: AtlasSessionHandoff,
): AtlasSessionRevocationBridge {
  if (!host || typeof host.subscribeBeforeSessionChange !== "function" ||
      !handoff || typeof handoff.beforeSessionChange !== "function" ||
      typeof handoff.dispose !== "function") {
    throw new Error("MUNDO_ATLAS_REVOCATION_CONTRACT_INCOMPLETE");
  }

  const recognized: readonly string[] = [
    "logout", "session-expired", "permissions-changed",
    "identity-changed", "atlas-closed",
  ];
  let closed = false;
  let registering = true;
  let emittedDuringRegistration = false;
  let unsubscribe: (() => void) | null = null;

  const shutdown = (): void => {
    if (closed) return;
    closed = true;
    const release = unsubscribe;
    unsubscribe = null;
    // Attempt BOTH operations even if one throws; never reopen.
    try { handoff.dispose(); }
    finally { release?.(); }
  };

  const onBeforeChange = (reason: AtlasSessionRevocationReason): void => {
    if (closed) return;
    if (registering) emittedDuringRegistration = true;
    if (!recognized.includes(reason)) {
      try { shutdown(); } catch { /* remain terminal */ }
      return;
    }
    try { handoff.beforeSessionChange(); }
    catch {
      try { shutdown(); } catch { /* remain terminal */ }
    }
  };

  try {
    const release = host.subscribeBeforeSessionChange(onBeforeChange);
    if (typeof release !== "function") {
      throw new Error("MUNDO_ATLAS_REVOCATION_UNSUBSCRIBE_REQUIRED");
    }
    unsubscribe = release;
    registering = false;
    if (emittedDuringRegistration || closed) {
      // A callback can close the bridge while subscribe is still returning.
      // A listener acquired only AFTER that closure must still be released.
      if (closed) {
        unsubscribe = null;
        try { release(); } catch { /* remain terminal */ }
      }
      throw new Error("MUNDO_ATLAS_REVOCATION_REGISTRATION_CHANGED");
    }
  } catch (error) {
    registering = false;
    try { shutdown(); } catch { /* preserve original registration error */ }
    throw error;
  }

  return {
    dispose(): void { shutdown(); },
    isClosed(): boolean { return closed; },
  };
}
