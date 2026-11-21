/**
 * MUNDO-ATLAS-RENDER-PROJECTION-011
 *
 * A PRIVATE-host-only read model. No DOM, network, storage or public-site import.
 * This module is NOT an authorization boundary on its own: only a trusted host
 * can supply the real verification callbacks used by admitAtlasSource.
 */
import {
  admitAtlasSource,
  type AtlasSourceApproval,
  type AtlasSourceEnvelope,
  type AtlasWorldId,
  type AtlasLayerKind,
} from "./mundo-atlas-source-contract";
import {
  hasAtlasGeographyShape,
  hasAtlasEvidenceShape,
} from "./mundo-atlas-layer-model";

export interface AtlasMapMarker {
  readonly id: string;
  readonly label: string;
  /** Equirectangular NORMALIZED display coordinates (0..1). */
  readonly x: number;
  readonly y: number;
}

export interface AtlasEvidenceItem {
  readonly id: string;
  readonly citation: string;
  readonly digestSha256: string;
}

export type AtlasView =
  | { readonly kind: "geography"; readonly worldId: AtlasWorldId;
      readonly revision: string; readonly markers: readonly AtlasMapMarker[] }
  | { readonly kind: "evidence"; readonly worldId: AtlasWorldId;
      readonly revision: string; readonly references: readonly AtlasEvidenceItem[] };

export type AtlasViewResult =
  | { readonly kind: "ready"; readonly view: AtlasView }
  | { readonly kind: "denied" }
  | { readonly kind: "stale" };

/**
 * Creates new, frozen, bounded, plain-data objects after host acceptance.
 * Any consuming UI must still render with textContent / safe SVG attributes,
 * ensure its own mount is tied to CURRENT host context, and revoke on logout.
 * Treat acceptance and projection as a single synchronous handoff on the host.
 */
function project(envelope: AtlasSourceEnvelope): AtlasView | null {
  if (envelope.kind === "geography") {
    if (!hasAtlasGeographyShape(envelope.payload) ||
        envelope.payload.worldId !== envelope.worldId) return null;
    const markers: AtlasMapMarker[] = envelope.payload.points.map((point) =>
      Object.freeze({
        id: point.id,
        label: point.label,
        x: (point.longitude + 180) / 360,
        y: (90 - point.latitude) / 180,
      }),
    );
    return Object.freeze({
      kind: "geography" as const,
      worldId: envelope.worldId,
      revision: envelope.revision,
      markers: Object.freeze(markers),
    });
  }

  if (envelope.kind === "evidence") {
    if (!hasAtlasEvidenceShape(envelope.payload) ||
        envelope.payload.worldId !== envelope.worldId) return null;
    const references: AtlasEvidenceItem[] = envelope.payload.references.map((entry) =>
      Object.freeze({
        id: entry.id,
        citation: entry.citation,
        digestSha256: entry.digestSha256,
      }),
    );
    return Object.freeze({
      kind: "evidence" as const,
      worldId: envelope.worldId,
      revision: envelope.revision,
      references: Object.freeze(references),
    });
  }
  return null;
}

/**
 * No fallback to sample data on denial. A verified payload MUST be immutable
 * throughout authorization (host responsibility); do not feed mutable input
 * from third-party plugins or untrusted callbacks directly into this helper.
 */
export async function prepareAuthorizedAtlasView(
  input: unknown,
  expectedWorldId: AtlasWorldId,
  expectedKind: AtlasLayerKind,
  host: AtlasSourceApproval,
): Promise<AtlasViewResult> {
  const admission = await admitAtlasSource(input, expectedWorldId, expectedKind, host);
  if (admission.kind !== "accepted") return { kind: admission.kind };
  const envelope = admission.envelope;

  // Copy immediately. Reject shape mutation, including a changed envelope.
  if (envelope.worldId !== expectedWorldId || envelope.kind !== expectedKind) {
    return { kind: "denied" };
  }
  let view: AtlasView | null = null;
  try { view = project(envelope); } catch { return { kind: "denied" }; }
  if (view === null) return { kind: "denied" };

  // A synchronous host hook can change the session even after approval.
  let current: string | null = null;
  let authorized = false;
  try {
    current = host.readContextVersion();
    if (typeof current !== "string" || current !== envelope.contextVersion) {
      return { kind: "stale" };
    }
    authorized = host.isStillAuthorized(expectedWorldId, expectedKind) === true;
    current = host.readContextVersion();
  } catch { return { kind: "denied" }; }
  if (current !== envelope.contextVersion) return { kind: "stale" };
  if (!authorized) return { kind: "denied" };
  return { kind: "ready", view };
}
