/**
 * CITADEL-READING-ROUTES-001
 *
 * Pure resolution of a consent-gated bookmark against an explicit, trusted
 * Citadel route manifest. Never navigate directly to a stored URL/fragment.
 * No browser globals, network, authority or automatic side effects.
 */
import {
  readChapterBookmark,
  type ChapterBookmark,
  type ChapterRegistry,
} from "./reading-chapter";
import {
  REGIONS,
  resumeReadingRegion,
  type RegionId,
  type StoragePort,
} from "./reading-state";

export interface ChapterRoute {
  /** A stable ID also present in the actual page's heading DOM. */
  readonly chapterId: string;
  /** Optional visible heading, only from the trusted site manifest. */
  readonly label: string;
}

export interface RegionRoute {
  /** A root-relative, origin-local path explicitly owned by Citadel. */
  readonly path: string;
  readonly chapters: readonly ChapterRoute[];
}

export type SiteRouteManifest =
  Readonly<Partial<Record<RegionId, RegionRoute>>>;

export type ResumeTarget =
  | { readonly kind: "chapter"; readonly region: RegionId; readonly path: string; readonly chapterId: string; readonly label: string }
  | { readonly kind: "region"; readonly region: RegionId; readonly path: string }
  | { readonly kind: "none" };

/**
 * Restrict all destinations to local, path-only routes. Disallow protocol-
 * relative paths, encoded separators, dot-segments, URL queries/fragments,
 * backslashes and controls. Caller must additionally enforce route access.
 */
export function isSafeSitePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length < 2 || path.length > 240) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (!/^\/[A-Za-z0-9/_-]+(?:\.html)?\/?$/.test(path)) return false;
  if (path.includes("/./") || path.includes("/../") || path.endsWith("/.") || path.endsWith("/..")) return false;
  return !path.split("/").some(part => part === "." || part === "..");
}

export function isChapterId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 96 &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

/**
 * A route is valid only when all chapter IDs are uniquely identifiable and
 * every label is bounded, printable, and non-empty. A malformed record must
 * not leave a partially navigable route in the manifest.
 */
export function isValidRegionRoute(value: unknown): value is RegionRoute {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const route = value as Record<string, unknown>;
  if (!isSafeSitePath(route.path) || !Array.isArray(route.chapters)) return false;
  if (route.chapters.length > 256) return false;
  const ids = new Set<string>();
  for (const chapter of route.chapters) {
    if (typeof chapter !== "object" || chapter === null || Array.isArray(chapter)) return false;
    const record = chapter as Record<string, unknown>;
    if (!isChapterId(record.chapterId) || ids.has(record.chapterId)) return false;
    if (typeof record.label !== "string" || record.label.trim().length === 0 || record.label.length > 120 || /[\\x00-\\x1F\\x7F]/.test(record.label)) return false;
    ids.add(record.chapterId);
  }
  return true;
}

/**
 * Build an allowlist from the site's own author-maintained route manifest.
 * Duplicate IDs are rejected by omission to avoid ambiguous resume targets.
 */
export function chapterRegistryFromManifest(manifest: SiteRouteManifest): ChapterRegistry {
  const output: Partial<Record<RegionId, string[]>> = Object.create(null);
  for (const region of REGIONS) {
    const route = manifest[region];
    if (!isValidRegionRoute(route)) continue;
    const counts = new Map<string, number>();
    for (const chapter of route.chapters) {
      if (isChapterId(chapter?.chapterId)) {
        counts.set(chapter.chapterId, (counts.get(chapter.chapterId) ?? 0) + 1);
      }
    }
    output[region] = [...counts].filter(([, count]) => count === 1).map(([id]) => id);
  }
  return output;
}

function resolvedChapter(
  bookmark: ChapterBookmark,
  manifest: SiteRouteManifest,
): ResumeTarget | null {
  const route = manifest[bookmark.region];
  if (!isValidRegionRoute(route)) return null;
  const registry = chapterRegistryFromManifest(manifest);
  if (!registry[bookmark.region]?.includes(bookmark.chapterId)) return null;
  const entry = route.chapters.find(chapter => chapter.chapterId === bookmark.chapterId);
  if (!entry || typeof entry.label !== "string") return null;
  return {
    kind: "chapter",
    region: bookmark.region,
    path: route.path,
    chapterId: bookmark.chapterId,
    label: entry.label.slice(0, 120),
  };
}

/**
 * Prefer an exact chapter only if it is still in the manifest. Otherwise
 * fall back to a legacy region bookmark; never guess a missing chapter.
 * Returns data for the caller to authorize and navigate deliberately.
 */
export function resolveResumeTarget(
  store: StoragePort,
  manifest: SiteRouteManifest,
): ResumeTarget {
  const chapter = readChapterBookmark(store, chapterRegistryFromManifest(manifest));
  if (chapter !== null) {
    const target = resolvedChapter(chapter, manifest);
    if (target !== null) return target;
  }
  const region = resumeReadingRegion(store);
  const path = region === null ? null : manifest[region]?.path;
  if (region !== null && isValidRegionRoute(manifest[region]) && isSafeSitePath(path)) {
    return { kind: "region", region, path };
  }
  return { kind: "none" };
}
