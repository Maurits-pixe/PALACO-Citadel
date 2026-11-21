/**
 * MUNDO-ATLAS-LAYER-MODEL-010
 *
 * Strict structural model for future HOST-VERIFIED Atlas layer data.
 * Shape validation is not a provenance, authorization or signature check.
 * No layer is consumed by the public Atlas demonstration.
 */
import type { AtlasWorldId } from "./mundo-atlas-source-contract";

export interface AtlasPoint {
  readonly id: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface AtlasGeographyLayer {
  readonly schema: "palaco.mundo.geography.v1";
  readonly worldId: AtlasWorldId;
  readonly projection: "EPSG:4326";
  readonly points: readonly AtlasPoint[];
}

export interface AtlasEvidenceReference {
  readonly id: string;
  /** Non-sensitive, opaque citation; never a URL, identity or access token. */
  readonly citation: string;
  readonly digestSha256: string;
}

export interface AtlasEvidenceLayer {
  readonly schema: "palaco.mundo.evidence.v1";
  readonly worldId: AtlasWorldId;
  readonly references: readonly AtlasEvidenceReference[];
}

export type AtlasLayerPayload = AtlasGeographyLayer | AtlasEvidenceLayer;
const WORLD = /^W-000[1-7]$/;
const ID = /^[a-zA-Z0-9._:-]{1,128}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_POINTS = 512;
const MAX_REFERENCES = 128;
const MAX_LABEL_LENGTH = 160;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function knownWorld(value: unknown): value is AtlasWorldId {
  return typeof value === "string" && WORLD.test(value);
}

function validLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= MAX_LABEL_LENGTH &&
    !/[<>\u0000-\u001f\u007f]/.test(value);
}

/**
 * Bound array sizes and numeric coordinates. The caller must still authorize
 * source, canonicalize + verify payload hashes and use a trusted renderer.
 */
export function hasAtlasGeographyShape(value: unknown): value is AtlasGeographyLayer {
  const v = record(value);
  if (!v || v.schema !== "palaco.mundo.geography.v1" ||
      !knownWorld(v.worldId) || v.projection !== "EPSG:4326" ||
      !Array.isArray(v.points) || v.points.length > MAX_POINTS) return false;
  const seen = new Set<string>();
  for (const item of v.points) {
    const p = record(item);
    if (!p || typeof p.id !== "string" || !ID.test(p.id) ||
        seen.has(p.id) || !validLabel(p.label) ||
        typeof p.latitude !== "number" || !Number.isFinite(p.latitude) ||
        p.latitude < -90 || p.latitude > 90 ||
        typeof p.longitude !== "number" || !Number.isFinite(p.longitude) ||
        p.longitude < -180 || p.longitude > 180) return false;
    seen.add(p.id);
  }
  return true;
}

export function hasAtlasEvidenceShape(value: unknown): value is AtlasEvidenceLayer {
  const v = record(value);
  if (!v || v.schema !== "palaco.mundo.evidence.v1" ||
      !knownWorld(v.worldId) || !Array.isArray(v.references) ||
      v.references.length > MAX_REFERENCES) return false;
  const seen = new Set<string>();
  for (const item of v.references) {
    const r = record(item);
    if (!r || typeof r.id !== "string" || !ID.test(r.id) ||
        seen.has(r.id) || typeof r.citation !== "string" ||
        !ID.test(r.citation) || typeof r.digestSha256 !== "string" ||
        !DIGEST.test(r.digestSha256)) return false;
    seen.add(r.id);
  }
  return true;
}

/** The envelope and payload must refer to the SAME world and layer kind. */
export function matchesAtlasLayerEnvelope(
  kind: "geography" | "evidence",
  worldId: AtlasWorldId,
  payload: unknown,
): payload is AtlasLayerPayload {
  return kind === "geography"
    ? hasAtlasGeographyShape(payload) && payload.worldId === worldId
    : hasAtlasEvidenceShape(payload) && payload.worldId === worldId;
}
