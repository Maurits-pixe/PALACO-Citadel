/**
 * MUNDO-ATLAS-SOURCE-CONTRACT-009
 *
 * Integration boundary for PRIVATE, host-authorized data. Not imported by the
 * public demo: no source, identity or authorization service is connected there.
 * A declared signature, source URL or "verified" flag is NOT cryptographic proof.
 */
export type AtlasWorldId =
  | "W-0001" | "W-0002" | "W-0003" | "W-0004"
  | "W-0005" | "W-0006" | "W-0007";

export type AtlasLayerKind = "geography" | "evidence";

/** The host alone supplies a trusted snapshot and independently verified grant. */
export interface AtlasSourceEnvelope {
  readonly schema: "palaco.mundo.atlas.layer.v1";
  readonly worldId: AtlasWorldId;
  readonly kind: AtlasLayerKind;
  readonly sourceId: string;
  readonly revision: string;
  readonly digestSha256: string;
  /** Host-generated context epoch; MUST never encode an identity or token. */
  readonly contextVersion: string;
  readonly payload: unknown;
}

export interface AtlasSourceApproval {
  /**
   * Return true only after independently authenticating source/provenance,
   * verifying digest + canonical payload, and enforcing actual access policy.
   * The public demo has no implementation for this function.
   */
  authorizeAndVerify(envelope: AtlasSourceEnvelope): Promise<boolean>;
  /** Current protected route/session/permissions, not an earlier grant. */
  isStillAuthorized(worldId: AtlasWorldId, kind: AtlasLayerKind): boolean;
  /** Rotate on every route/session/permission transition, with no ABA reuse. */
  readContextVersion(): string | null;
}

export type AtlasGateResult =
  | { readonly kind: "accepted"; readonly envelope: AtlasSourceEnvelope }
  | { readonly kind: "denied" }
  | { readonly kind: "stale" };

const KNOWN_WORLDS: ReadonlySet<string> = new Set([
  "W-0001", "W-0002", "W-0003", "W-0004",
  "W-0005", "W-0006", "W-0007",
]);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-zA-Z0-9._:-]{1,128}$/;

/** Pure shape gate; never counts as authenticity or authorization. */
export function hasAtlasSourceShape(value: unknown): value is AtlasSourceEnvelope {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return r.schema === "palaco.mundo.atlas.layer.v1" &&
    typeof r.worldId === "string" && KNOWN_WORLDS.has(r.worldId) &&
    (r.kind === "geography" || r.kind === "evidence") &&
    typeof r.sourceId === "string" && SAFE_ID.test(r.sourceId) &&
    typeof r.revision === "string" && SAFE_ID.test(r.revision) &&
    typeof r.contextVersion === "string" && SAFE_ID.test(r.contextVersion) &&
    typeof r.digestSha256 === "string" && SHA256.test(r.digestSha256) &&
    r.payload !== null && typeof r.payload === "object" && !Array.isArray(r.payload);
}

/**
 * Fail-closed admission. A trusted host must perform actual source and grant
 * checks. No layer is returned if the host changes context during verification.
 * Never feed the accepted payload into innerHTML or untrusted URL sinks.
 */
export async function admitAtlasSource(
  raw: unknown,
  expectedWorldId: AtlasWorldId,
  expectedKind: AtlasLayerKind,
  host: AtlasSourceApproval,
): Promise<AtlasGateResult> {
  if (!hasAtlasSourceShape(raw) ||
      raw.worldId !== expectedWorldId || raw.kind !== expectedKind) {
    return { kind: "denied" };
  }
  if (host === null || typeof host !== "object" ||
      typeof host.authorizeAndVerify !== "function" ||
      typeof host.isStillAuthorized !== "function" ||
      typeof host.readContextVersion !== "function") {
    return { kind: "denied" };
  }

  const version = (): string | null => {
    try {
      const v = host.readContextVersion();
      return typeof v === "string" && SAFE_ID.test(v) ? v : null;
    } catch { return null; }
  };

  // Snapshot must be trusted and match the envelope. Version cannot serve as
  // identity; it is only an additional stale-context safeguard.
  const start = version();
  if (start === null || start !== raw.contextVersion) return { kind: "denied" };

  let verified = false;
  try { verified = await host.authorizeAndVerify(raw) === true; }
  catch { verified = false; }

  const postVerify = version();
  if (postVerify === null) return { kind: "denied" };
  if (postVerify !== start) return { kind: "stale" };
  if (!verified) return { kind: "denied" };

  let authorized = false;
  try { authorized = host.isStillAuthorized(expectedWorldId, expectedKind) === true; }
  catch { authorized = false; }

  const finalVersion = version();
  if (finalVersion === null) return { kind: "denied" };
  if (finalVersion !== start) return { kind: "stale" };
  if (!authorized) return { kind: "denied" };
  return { kind: "accepted", envelope: raw };
}
