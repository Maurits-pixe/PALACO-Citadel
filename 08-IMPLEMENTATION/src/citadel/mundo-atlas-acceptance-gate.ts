/**
 * MUNDO-ATLAS-ACCEPTANCE-GATE-029
 *
 * Engineering evidence register ONLY. This draft implementation is hard
 * locked to HOLD: it never creates an authenticated session, calls a host,
 * imports the private integration runtime or grants access to map data.
 *
 * Evidence labels and references are NOT cryptographic proof or authority.
 * Real release requires independent review, actual tests and a separately
 * authorized change of the immutable policy in reviewed source code.
 */
import type { AtlasPrivateIntegration } from "./mundo-atlas-private-integration";
import type { AtlasLayerKind, AtlasWorldId } from "./mundo-atlas-source-contract";
import type { AtlasWorldSwitchResult } from "./mundo-atlas-world-transition";

export const ATLAS_RELEASE_POLICY = "HOLD" as const;

export const ATLAS_ACCEPTANCE_REQUIREMENTS = [
  "protected-host-authentication",
  "source-integrity-and-provenance",
  "session-and-permission-revocation",
  "world-route-context-isolation",
  "desktop-and-mobile-regression",
  "independent-security-review",
  "owner-acceptance",
] as const;

export type AtlasAcceptanceRequirement =
  (typeof ATLAS_ACCEPTANCE_REQUIREMENTS)[number];
export type AtlasEvidenceState = "missing" | "submitted" | "verified";

export interface AtlasAcceptanceEvidence {
  readonly requirement: AtlasAcceptanceRequirement;
  readonly state: AtlasEvidenceState;
  /** Non-sensitive external evidence identifier; not a password or token. */
  readonly reference?: string;
}

export interface AtlasAcceptanceReport {
  readonly policy: typeof ATLAS_RELEASE_POLICY;
  readonly decision: "HOLD";
  readonly missing: readonly AtlasAcceptanceRequirement[];
  readonly pendingIndependentReview: readonly AtlasAcceptanceRequirement[];
  readonly verifiedClaims: readonly AtlasAcceptanceRequirement[];
  /** Always false. Claiming VERIFIED can never bypass the release lock. */
  readonly activationPermitted: false;
}

/**
 * Treat evidence supplied by callers as untrusted claims, not authorization.
 * Explicitly reject duplicate requirements and malformed reference values.
 * The report intentionally carries no personal data or private source.
 */
export function assessAtlasAcceptanceEvidence(
  evidence: readonly AtlasAcceptanceEvidence[] | unknown,
): AtlasAcceptanceReport {
  const byRequirement = new Map<AtlasAcceptanceRequirement, AtlasEvidenceState>();
  if (Array.isArray(evidence)) {
    for (const entry of evidence) {
      if (!entry || typeof entry !== "object") continue;
      const value = entry as Partial<AtlasAcceptanceEvidence>;
      if (!ATLAS_ACCEPTANCE_REQUIREMENTS.includes(
        value.requirement as AtlasAcceptanceRequirement,
      ) || byRequirement.has(value.requirement as AtlasAcceptanceRequirement)) {
        continue;
      }
      if (value.state !== "missing" && value.state !== "submitted" &&
          value.state !== "verified") continue;
      if (value.state !== "missing" &&
          (typeof value.reference !== "string" ||
           !/^[A-Za-z0-9._:/#-]{4,160}$/.test(value.reference))) continue;
      byRequirement.set(value.requirement as AtlasAcceptanceRequirement, value.state);
    }
  }

  const missing = ATLAS_ACCEPTANCE_REQUIREMENTS.filter(
    (requirement) => !byRequirement.has(requirement) ||
      byRequirement.get(requirement) === "missing",
  );
  const pendingIndependentReview = ATLAS_ACCEPTANCE_REQUIREMENTS.filter(
    (requirement) => byRequirement.get(requirement) === "submitted",
  );
  const verifiedClaims = ATLAS_ACCEPTANCE_REQUIREMENTS.filter(
    (requirement) => byRequirement.get(requirement) === "verified",
  );
  return Object.freeze({
    policy: ATLAS_RELEASE_POLICY,
    decision: "HOLD" as const,
    missing: Object.freeze(missing),
    pendingIndependentReview: Object.freeze(pendingIndependentReview),
    verifiedClaims: Object.freeze(verifiedClaims),
    activationPermitted: false as const,
  });
}

export interface AtlasAcceptanceGate {
  readonly report: AtlasAcceptanceReport;
  /** Terminal HOLD: never delegates to a private runtime. */
  openWorld(worldId: AtlasWorldId, kind: AtlasLayerKind): Promise<AtlasWorldSwitchResult>;
  /** True means the gate is blocked; no authorization is implied. */
  isBlocked(): true;
}

/**
 * The private integration may be provided for future review, but it is
 * deliberately never called. There is no release override in this version.
 */
export function createAtlasAcceptanceGate(
  evidence: readonly AtlasAcceptanceEvidence[] | unknown = [],
  _privateIntegration?: AtlasPrivateIntegration,
): AtlasAcceptanceGate {
  const report = assessAtlasAcceptanceEvidence(evidence);
  return Object.freeze({
    report,
    openWorld(_worldId: AtlasWorldId, _kind: AtlasLayerKind) {
      return Promise.resolve({ kind: "denied" } as const);
    },
    isBlocked(): true { return true; },
  });
}
