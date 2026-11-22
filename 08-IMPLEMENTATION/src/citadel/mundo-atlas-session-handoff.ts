/**
 * MUNDO-ATLAS-SESSION-HANDOFF-025
 *
 * Explicit host integration boundary for PALACO ONE -> private Citadel ->
 * MUNDO Atlas. Not a login implementation, token handler, session cache,
 * browser router, identity assertion or publicly deployed component.
 */
import type { AtlasNavigationBridge } from "./mundo-atlas-navigation-bridge";
import type { AtlasLayerKind, AtlasWorldId } from "./mundo-atlas-source-contract";
import type { AtlasWorldSwitchResult } from "./mundo-atlas-world-transition";

export interface AtlasSessionHandoffHost {
  /**
   * Trusted host independently establishes a protected Citadel session.
   * Must return true only after validating actual PALACO ONE authentication,
   * current route permissions, freshness and user consent as applicable.
   * No token or identity is returned to MUNDO.
   */
  establishProtectedSession(): Promise<boolean>;
  /**
   * Host-generated opaque non-reused version of session and permission state.
   * Version changes for EVERY session/permission transition (including
   * logout), and contains no identity, token or other sensitive information.
   */
  readProtectedSessionVersion(): string | null;
}
export interface AtlasSessionHandoff {
  /** Revoke prior data before establishing a new protected session. */
  handoff(worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasWorldSwitchResult>;
  /** Host must call synchronously BEFORE logout/session/permission change. */
  beforeSessionChange(): void;
  dispose(): void;
}

/**
 * No session replay: each explicit handoff starts by revoking the previous
 * Atlas view. Route navigation itself repeats source, authorization and
 * context checks under the real protected Citadel host.
 */
export function createAtlasSessionHandoff(
  host: AtlasSessionHandoffHost,
  navigation: AtlasNavigationBridge,
): AtlasSessionHandoff {
  if (!host || typeof host.establishProtectedSession !== "function" ||
      typeof host.readProtectedSessionVersion !== "function" ||
      !navigation || typeof navigation.navigate !== "function" ||
      typeof navigation.beforeContextChange !== "function" ||
      typeof navigation.dispose !== "function") {
    throw new Error("MUNDO_ATLAS_SESSION_HANDOFF_INCOMPLETE");
  }

  let closed = false;
  let epoch = 0;
  let pending = false;
  let quarantined = false;
  const version = (): string | null => {
    try {
      const value = host.readProtectedSessionVersion();
      return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
        ? value : null;
    } catch { return null; }
  };
  const revoke = (): void => {
    ++epoch;
    try { navigation.beforeContextChange(); }
    catch {
      quarantined = true;
      // An unconfirmed teardown must never allow further MUNDO activation.
      try { navigation.dispose(); } catch { /* fail closed */ }
    }
  };

  return {
    async handoff(worldId, kind): Promise<AtlasWorldSwitchResult> {
      if (closed || quarantined || pending) return "denied";
      pending = true;
      const request = ++epoch;
      try {
        // Old Atlas is revoked BEFORE the session-establishment callback.
        revoke();
        if (quarantined || closed) return "denied";
        // Revoke changes epoch once: capture the new generation explicitly.
        const current = epoch;
        let approved = false;
        try { approved = await host.establishProtectedSession() === true; }
        catch { /* deny */ }
        if (closed || quarantined || epoch !== current) return "stale";
        if (!approved) return "denied";
        const session = version();
        if (session === null) return "denied";

        let result: AtlasWorldSwitchResult = "denied";
        try { result = await navigation.navigate(worldId, kind); }
        catch {
          revoke();
          return "denied";
        }
        if (closed || quarantined || epoch !== current) return "stale";
        // A same-world route might belong to a new session. Never leave a
        // mounted old-context view alive if the trusted session changes.
        if (version() !== session) {
          revoke();
          return "stale";
        }
        return result;
      } finally {
        pending = false;
        void request;
      }
    },
    beforeSessionChange(): void { if (!closed) revoke(); },
    dispose(): void {
      if (closed) return;
      closed = true;
      ++epoch;
      try { navigation.dispose(); } catch { quarantined = true; }
    },
  };
}
