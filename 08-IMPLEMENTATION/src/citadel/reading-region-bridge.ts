/**
 * CITADEL-REGION-BRIDGE-001
 *
 * Explicit bridge between the currently documented Leeskompas region keys
 * and the canonical reading-state keys. Keys are not route paths and never
 * grant access. The original Sites source must be checked before wiring.
 */
import {
  REGIONS,
  type RegionId,
} from "./reading-state";
import {
  type ChapterRoute,
  type SiteRouteManifest,
} from "./reading-routes";

export const LEESKOMPAS_REGION_IDS = [
  "samenleving",
  "geheugen",
  "proof",
  "atelier",
  "eva",
] as const;

export type LeeskompasRegionId = (typeof LEESKOMPAS_REGION_IDS)[number];

/**
 * Mapping for review, NOT a claim that the currently published site uses
 * these exact IDs. No guess is made about paths, actual chapter IDs or access.
 */
const SITE_TO_CANONICAL: Readonly<Record<LeeskompasRegionId, RegionId>> = {
  samenleving: "samenleving-natuur",
  geheugen: "geheugen-tijd",
  proof: "proof-bewijs",
  atelier: "atelier",
  eva: "eva",
};

const CANONICAL_TO_SITE: Readonly<Record<RegionId, LeeskompasRegionId>> = {
  "samenleving-natuur": "samenleving",
  "geheugen-tijd": "geheugen",
  "proof-bewijs": "proof",
  atelier: "atelier",
  eva: "eva",
};

export function toCanonicalRegion(id: unknown): RegionId | null {
  if (typeof id !== "string" ||
      !Object.prototype.hasOwnProperty.call(SITE_TO_CANONICAL, id)) {
    return null;
  }
  return SITE_TO_CANONICAL[id as LeeskompasRegionId];
}

export function toLeeskompasRegion(id: unknown): LeeskompasRegionId | null {
  if (typeof id !== "string" ||
      !(REGIONS as readonly string[]).includes(id)) {
    return null;
  }
  return CANONICAL_TO_SITE[id as RegionId];
}

export interface VerifiedSiteRegion {
  readonly siteRegion: LeeskompasRegionId;
  /** Must come from trusted, reviewed frontend routes. */
  readonly path: string;
  /** Must come from the actual trusted chapter list. */
  readonly chapters: readonly ChapterRoute[];
}

/**
 * Convert only an explicit set of trusted entries. Malformed, duplicated or
 * unknown regions fail closed: the entire manifest is rejected.
 *
 * The result still needs the route resolver's strict path/ID validation and
 * the actual site's access check before any navigation occurs.
 */
export function createCanonicalManifest(
  entries: readonly VerifiedSiteRegion[],
): SiteRouteManifest | null {
  if (!Array.isArray(entries) || entries.length > REGIONS.length) return null;
  const result: Partial<Record<RegionId, { path: string; chapters: readonly ChapterRoute[] }>> =
    Object.create(null);
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return null;
    const region = toCanonicalRegion(entry.siteRegion);
    if (
      region === null ||
      Object.prototype.hasOwnProperty.call(result, region) ||
      typeof entry.path !== "string" ||
      paths.has(entry.path) ||
      !Array.isArray(entry.chapters)
    ) return null;
    paths.add(entry.path);
    result[region] = {
      path: entry.path,
      chapters: entry.chapters,
    };
  }
  return result;
}
