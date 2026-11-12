/**
 * CITADEL-READING-MANIFEST-GATE-001
 * Admission check BEFORE mounting the private Leeskompas.
 *
 * Accepts only a complete, trusted five-region manifest with unique
 * local paths and non-ambiguous chapter IDs. It is not access authorization.
 */
import { REGIONS, type RegionId } from "./reading-state";
import {
  isValidRegionRoute,
  type SiteRouteManifest,
} from "./reading-routes";

export type ManifestAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "missing-manifest"
        | "unknown-region"
        | "missing-region"
        | "invalid-route"
        | "duplicate-path";
    };

export function admitReadingManifest(value: unknown): ManifestAdmission {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "missing-manifest" };
  }

  const manifest = value as Record<string, unknown>;
  const keys = Object.keys(manifest);
  if (keys.some(key => !(REGIONS as readonly string[]).includes(key))) {
    return { ok: false, reason: "unknown-region" };
  }
  if (keys.length !== REGIONS.length) {
    return { ok: false, reason: "missing-region" };
  }

  const paths = new Set<string>();
  for (const region of REGIONS) {
    if (!Object.prototype.hasOwnProperty.call(manifest, region)) {
      return { ok: false, reason: "missing-region" };
    }
    const route = manifest[region];
    if (!isValidRegionRoute(route) || route.chapters.length === 0) {
      return { ok: false, reason: "invalid-route" };
    }
    if (paths.has(route.path)) {
      return { ok: false, reason: "duplicate-path" };
    }
    paths.add(route.path);
  }
  return { ok: true };
}

/** Typed helper for callers supplying a statically declared site manifest. */
export function isAdmittedReadingManifest(
  manifest: SiteRouteManifest,
): manifest is Readonly<Record<RegionId, NonNullable<SiteRouteManifest[RegionId]>>> {
  return admitReadingManifest(manifest).ok;
}
